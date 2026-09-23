#!/usr/bin/env python3
"""Bring an existing .env in line with .env.sample without overwriting values.

The output follows .env.sample's layout and comments. For every key:

- set in .env: its value is kept exactly as written, even when empty;
- an optional "# KEY=default" line in the sample that .env sets: kept, uncommented;
- only in the sample: added with the sample's placeholder;
- only in .env (no longer read by any code): dropped, and listed.

A renamed key carries its value to the new name when the new one is unset.
Reports print key names only, never values. Dry run by default; --write saves,
after copying the old file to .env.bak (or .env.bak.1, .2, ...).

    python3 scripts/sync_env.py          # show what would change
    python3 scripts/sync_env.py --write  # apply it
"""

from __future__ import annotations

import argparse
import re
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

# Old name -> new name. The value moves only when the new key is unset.
RENAMED = {"LOS_BOX_FOLDER_ID": "VITE_BOX_FOLDER_ID"}

ACTIVE = re.compile(r"^(?:export\s+)?([A-Z][A-Z0-9_]*)=(.*)$")
OPTIONAL = re.compile(r"^#\s?([A-Z][A-Z0-9_]*)=(.*)$")


def read_values(text: str) -> dict[str, str]:
    """Active KEY=value lines of an env file; the raw text after '=' is kept."""
    values: dict[str, str] = {}
    for line in text.splitlines():
        match = ACTIVE.match(line.strip())
        if match:
            values[match.group(1)] = match.group(2)
    return values


def is_unset(value: str | None) -> bool:
    return value is None or value.strip() in ("", '""', "''") or value.strip().startswith("<")


def sync(sample: str, current: str) -> tuple[str, dict[str, list[str]]]:
    values = read_values(current)
    report: dict[str, list[str]] = {"kept": [], "added": [], "moved": [], "removed": []}

    for old, new in RENAMED.items():
        if old in values and is_unset(values.get(new)) and not is_unset(values[old]):
            values[new] = values[old]
            report["moved"].append(f"{old} -> {new}")

    known: set[str] = set()
    out: list[str] = []
    for line in sample.splitlines():
        active, optional = ACTIVE.match(line), OPTIONAL.match(line)
        if active:
            key = active.group(1)
            known.add(key)
            if key in values:
                out.append(f"{key}={values[key]}")
                report["kept"].append(key)
            else:
                out.append(line)
                report["added"].append(key)
        elif optional:
            key = optional.group(1)
            known.add(key)
            if key in values:
                out.append(f"{key}={values[key]}")
                report["kept"].append(key)
            else:
                out.append(line)
        else:
            out.append(line)

    moved_from = {pair.split(" -> ")[0] for pair in report["moved"]}
    report["removed"] = sorted(key for key in values if key not in known and key not in moved_from)
    report["removed"] += sorted(moved_from)
    return "\n".join(out) + "\n", report


def backup_path(env: Path) -> Path:
    candidate = env.with_name(env.name + ".bak")
    counter = 1
    while candidate.exists():
        candidate = env.with_name(f"{env.name}.bak.{counter}")
        counter += 1
    return candidate


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--write", action="store_true", help="save the result (default: dry run)")
    parser.add_argument("--env", type=Path, default=ROOT / ".env")
    parser.add_argument("--sample", type=Path, default=ROOT / ".env.sample")
    args = parser.parse_args(argv)

    sample = args.sample.read_text(encoding="utf-8")
    if not args.env.exists():
        if args.write:
            args.env.write_text(sample, encoding="utf-8")
            print(f"Created {args.env.name} from {args.sample.name}. Fill in the values.")
        else:
            print(f"No {args.env.name} yet; --write would create it from {args.sample.name}.")
        return 0

    current = args.env.read_text(encoding="utf-8")
    result, report = sync(sample, current)

    print(f"Kept {len(report['kept'])} value(s) as they are.")
    for label in ("added", "moved", "removed"):
        if report[label]:
            print(f"{label.capitalize()}: {', '.join(report[label])}")

    if result == current:
        print(f"{args.env.name} is already in sync.")
        return 0
    if not args.write:
        print("Dry run: nothing written. Re-run with --write to apply.")
        return 0

    backup = backup_path(args.env)
    shutil.copy2(args.env, backup)
    args.env.write_text(result, encoding="utf-8")
    print(f"Wrote {args.env.name}; the previous version is in {backup.name}.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
