#!/usr/bin/env python3
"""Clean up demo loan records and associated Box folders.

This script provides safe deletion of LOS loan records and their Box folders:
- Queries Salesforce for loans matching filters
- Deletes loan records from Salesforce
- Deletes associated Box folders
- Supports dry-run mode and confirmation prompts

Examples:
    # Preview what would be deleted (dry-run)
    python3 scripts/cleanup_demo.py --dry-run

    # Delete all Application status loans
    python3 scripts/cleanup_demo.py --status Application --yes

    # Delete specific loan by ID
    python3 scripts/cleanup_demo.py --loan-id LN-2026-0042 --yes

    # Delete loans created today
    python3 scripts/cleanup_demo.py --today --yes

    # Interactive mode (prompts for each deletion)
    python3 scripts/cleanup_demo.py --interactive
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_CONFIG = ROOT / "config/runtime/demo-environment.json"


class CleanupError(Exception):
    """Raised when cleanup operations fail."""
    pass


def load_json(path: Path) -> dict[str, Any]:
    """Load JSON config file."""
    if not path.exists():
        raise CleanupError(f"Config file not found: {path}")
    return json.loads(path.read_text(encoding="utf-8"))


def run_json(cmd: list[str], **kwargs) -> dict[str, Any]:
    """Run command and parse JSON output."""
    result = subprocess.run(
        cmd,
        capture_output=True,
        text=True,
        check=False,
        **kwargs
    )
    if result.returncode != 0:
        raise CleanupError(f"Command failed: {' '.join(cmd)}\n{result.stderr}")

    try:
        return json.loads(result.stdout)
    except json.JSONDecodeError as e:
        raise CleanupError(f"Failed to parse JSON output: {e}\n{result.stdout}")


def query_loans(
    org_alias: str,
    *,
    loan_id: str | None = None,
    status: str | None = None,
    borrower: str | None = None,
    created_today: bool = False,
    created_days: int | None = None,
) -> list[dict[str, Any]]:
    """Query Salesforce for loans matching criteria."""
    conditions = []

    if loan_id:
        conditions.append(f"Loan_ID__c = '{loan_id}'")
    if status:
        conditions.append(f"Status__c = '{status}'")
    if borrower:
        conditions.append(f"Borrower_Entity__c LIKE '%{borrower}%'")
    if created_today:
        conditions.append("CreatedDate = TODAY")
    elif created_days:
        conditions.append(f"CreatedDate = LAST_N_DAYS:{created_days}")

    where_clause = " AND ".join(conditions) if conditions else "Id != null"

    query = (
        f"SELECT Id, Loan_ID__c, Borrower_Entity__c, Status__c, "
        f"Box_Workspace_Folder_ID__c, CreatedDate "
        f"FROM LOS_Loan__c WHERE {where_clause}"
    )

    result = run_json([
        "sf", "data", "query",
        "--target-org", org_alias,
        "--query", query,
        "--json",
    ], cwd=ROOT / "los-salesforce-project")

    records = result.get("result", {}).get("records", [])
    return records


def delete_salesforce_records(org_alias: str, record_ids: list[str], *, dry_run: bool = False) -> None:
    """Delete Salesforce loan records."""
    if not record_ids:
        return

    if dry_run:
        print(f"[DRY-RUN] Would delete {len(record_ids)} Salesforce record(s)")
        return

    # Create CSV with IDs
    csv_content = "Id\n" + "\n".join(record_ids)
    csv_file = ROOT / "config/runtime/cleanup-records.csv"
    csv_file.write_text(csv_content)

    try:
        result = run_json([
            "sf", "data", "delete", "bulk",
            "--target-org", org_alias,
            "--sobject", "LOS_Loan__c",
            "--file", str(csv_file),
            "--wait", "10",
            "--json",
        ], cwd=ROOT / "los-salesforce-project")

        print(f"✅ Deleted {len(record_ids)} Salesforce record(s)")
    finally:
        if csv_file.exists():
            csv_file.unlink()


def delete_box_folder(folder_id: str, *, dry_run: bool = False) -> None:
    """Delete Box folder recursively."""
    if not folder_id:
        return

    if dry_run:
        print(f"[DRY-RUN] Would delete Box folder {folder_id}")
        return

    try:
        subprocess.run(
            ["box", "folders:delete", folder_id, "--recursive", "--yes"],
            capture_output=True,
            text=True,
            check=True,
        )
        print(f"✅ Deleted Box folder {folder_id}")
    except subprocess.CalledProcessError as e:
        # Folder might already be deleted or not exist
        if "404" in e.stderr or "not found" in e.stderr.lower():
            print(f"⚠️  Box folder {folder_id} not found (may already be deleted)")
        else:
            raise CleanupError(f"Failed to delete Box folder {folder_id}: {e.stderr}")


def cleanup(
    config_path: Path,
    *,
    loan_id: str | None = None,
    status: str | None = None,
    borrower: str | None = None,
    created_today: bool = False,
    created_days: int | None = None,
    dry_run: bool = False,
    interactive: bool = False,
    confirm: bool = False,
) -> None:
    """Execute cleanup workflow."""
    config = load_json(config_path)
    org_alias = config["salesforce"]["orgAlias"]

    # Query for matching loans
    print("Querying for loans...")
    loans = query_loans(
        org_alias,
        loan_id=loan_id,
        status=status,
        borrower=borrower,
        created_today=created_today,
        created_days=created_days,
    )

    if not loans:
        print("No loans found matching criteria.")
        return

    print(f"\nFound {len(loans)} loan(s):")
    for loan in loans:
        print(f"  • {loan['Loan_ID__c']} - {loan['Borrower_Entity__c']} ({loan['Status__c']})")
        if loan.get('Box_Workspace_Folder_ID__c'):
            print(f"    Box folder: {loan['Box_Workspace_Folder_ID__c']}")

    # Confirmation
    if not dry_run and not confirm:
        if interactive:
            response = input(f"\nDelete these {len(loans)} loan(s)? [y/N] ")
            if response.lower() != 'y':
                print("Cancelled.")
                return
        else:
            print("\n⚠️  Use --yes to confirm deletion, or --dry-run to preview")
            return

    # Delete each loan
    print(f"\n{'[DRY-RUN] ' if dry_run else ''}Deleting loans...")

    record_ids = []
    for loan in loans:
        loan_id_value = loan['Loan_ID__c']

        if interactive and not dry_run:
            response = input(f"Delete {loan_id_value}? [y/N] ")
            if response.lower() != 'y':
                print(f"  Skipped {loan_id_value}")
                continue

        record_ids.append(loan['Id'])

        # Delete Box folder
        folder_id = loan.get('Box_Workspace_Folder_ID__c')
        if folder_id:
            try:
                delete_box_folder(folder_id, dry_run=dry_run)
            except CleanupError as e:
                print(f"⚠️  {e}")

    # Delete Salesforce records in bulk
    if record_ids:
        delete_salesforce_records(org_alias, record_ids, dry_run=dry_run)

    print(f"\n{'[DRY-RUN] ' if dry_run else ''}Cleanup complete!")


def main():
    parser = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("--config", type=Path, default=DEFAULT_CONFIG)
    parser.add_argument("--loan-id", help="Delete specific loan by Loan_ID__c")
    parser.add_argument("--status", help="Delete loans with this status (e.g., Application, Underwriting)")
    parser.add_argument("--borrower", help="Delete loans for this borrower (partial match)")
    parser.add_argument("--today", action="store_true", dest="created_today", help="Delete loans created today")
    parser.add_argument("--last-n-days", type=int, dest="created_days", help="Delete loans created in last N days")
    parser.add_argument("--dry-run", action="store_true", help="Preview what would be deleted without deleting")
    parser.add_argument("--interactive", action="store_true", help="Prompt before each deletion")
    parser.add_argument("--yes", "--confirm", dest="confirm", action="store_true", help="Confirm deletion (required unless --dry-run or --interactive)")

    args = parser.parse_args()

    # Validate arguments
    if not any([args.loan_id, args.status, args.borrower, args.created_today, args.created_days]):
        parser.error("Must specify at least one filter: --loan-id, --status, --borrower, --today, or --last-n-days")

    try:
        cleanup(
            args.config,
            loan_id=args.loan_id,
            status=args.status,
            borrower=args.borrower,
            created_today=args.created_today,
            created_days=args.created_days,
            dry_run=args.dry_run,
            interactive=args.interactive,
            confirm=args.confirm,
        )
    except CleanupError as e:
        print(f"❌ {e}", file=sys.stderr)
        sys.exit(1)
    except KeyboardInterrupt:
        print("\n\nCancelled by user.")
        sys.exit(1)


if __name__ == "__main__":
    main()
