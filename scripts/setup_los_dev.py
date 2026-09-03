#!/usr/bin/env python3
"""Run setup dependencies and seed environment context from local CLIs in one command."""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from shutil import which
from typing import Any, Callable

ROOT = Path(__file__).resolve().parents[1]


class SetupError(RuntimeError):
    pass


@dataclass
class Step:
    title: str
    command: list[str]
    required_tool: str | None = None


@dataclass
class StepResult:
    title: str
    command: list[str] | None
    ok: bool
    skipped: bool = False
    duration_ms: int = 0
    error: str = ""


def _ask_bool(prompt: str, *, default: bool) -> bool:
    while True:
        label = "Y/n" if default else "y/N"
        response = input(f"{prompt} ({label})").strip().lower()
        if not response:
            return default
        if response in {"y", "yes"}:
            return True
        if response in {"n", "no"}:
            return False
        print("Please answer y/yes or n/no")


def _ask_text(prompt: str, default: str = "") -> str:
    suffix = f" [{default}]" if default else ""
    response = input(f"{prompt}{suffix}: ").strip()
    return response or default


def _get_nested(data: dict[str, Any], dotted_key: str) -> Any:
    value: Any = data
    for key in dotted_key.split("."):
        if not isinstance(value, dict):
            return ""
        if key not in value:
            return ""
        value = value[key]
    return value


def _set_nested(data: dict[str, Any], dotted_key: str, value: Any) -> None:
    keys = dotted_key.split(".")
    cursor = data
    for key in keys[:-1]:
        cursor = cursor.setdefault(key, {})
        if not isinstance(cursor, dict):
            raise SetupError(f"Cannot set {dotted_key}; {key} is not an object")
    cursor[keys[-1]] = value


def _json_or_none(command: list[str]) -> dict[str, Any] | list[Any] | None:
    result = subprocess.run(command, cwd=ROOT, capture_output=True, text=True)
    if result.returncode != 0:
        return None
    text = (result.stdout or "").strip()
    if not text:
        return None
    try:
        payload = json.loads(text)
    except json.JSONDecodeError:
        return None
    if isinstance(payload, list) and payload and isinstance(payload[0], dict):
        return payload[0]
    if isinstance(payload, dict):
        return payload
    return None


def _normalize_salesforce_payload(payload: Any) -> dict[str, Any]:
    if isinstance(payload, dict) and isinstance(payload.get("result"), dict):
        return payload["result"]
    if isinstance(payload, dict):
        return payload
    return {}


def _command_exists(name: str) -> bool:
    return which(name) is not None


def _print_pet() -> None:
    print(r" / \_/\\")
    print("(=^.^=)")
    print(" /     \\")


def _progress_bar(index: int, total: int, title: str, state: str) -> None:
    symbols = {
        "running": "⚙️",
        "done": "✅",
        "skip": "⏭️",
        "error": "❌",
    }
    width = 26
    filled = int((index - 1) / max(1, total) * width)
    bar = "#" * filled + "." * (width - filled)
    print(f"[{symbols[state]}][{bar}] {index:>2}/{total} {title}")


def _run_command(step: Step, *, dry_run: bool, interactive: bool) -> StepResult:
    if dry_run:
        return StepResult(step.title, step.command, ok=True, skipped=True)

    if interactive and not _ask_bool(f"Run: {step.title}", default=True):
        return StepResult(step.title, step.command, ok=True, skipped=True)

    if step.required_tool and not _command_exists(step.required_tool):
        return StepResult(step.title, step.command, ok=False, error=f"Missing required command: {step.required_tool}")

    start = time.perf_counter()
    result = subprocess.run(step.command, cwd=ROOT)
    elapsed_ms = int((time.perf_counter() - start) * 1000)
    if result.returncode != 0:
        return StepResult(step.title, step.command, ok=False, duration_ms=elapsed_ms, error=f"Command failed with exit code {result.returncode}")
    return StepResult(step.title, step.command, ok=True, duration_ms=elapsed_ms)


def _collect_context_probe() -> dict[str, Any]:
    updates: dict[str, Any] = {}

    box_payload = _json_or_none(["box", "users:get", "me", "--fields", "login,enterprise", "--json"])
    if isinstance(box_payload, dict):
        _login = str(box_payload.get("login", "")).strip()
        enterprise = box_payload.get("enterprise") if isinstance(box_payload, dict) else None
        enterprise_id = str(enterprise.get("id", "")) if isinstance(enterprise, dict) else ""
        if _login:
            updates["box.operatorLogin"] = _login
        if enterprise_id:
            updates["box.enterpriseId"] = enterprise_id

    sf_payload = _json_or_none(["sf", "org", "display", "--json", "--verbose"])
    sf_result = _normalize_salesforce_payload(sf_payload)
    if sf_result:
        org_alias = str(sf_result.get("alias", ""))
        org_id = str(sf_result.get("id", ""))
        domain = str(sf_result.get("instanceUrl", ""))
        operator_username = str(sf_result.get("username", ""))

        if org_alias:
            updates["salesforce.orgAlias"] = org_alias
        if org_id:
            updates["salesforce.orgId"] = org_id
        if domain:
            updates["salesforce.myDomainUrl"] = domain
        if operator_username:
            updates["salesforce.operatorUsername"] = operator_username

    return updates


def _apply_context(
    env: dict[str, Any],
    updates: dict[str, Any],
    *,
    interactive: bool,
    overwrite: bool,
    required: list[str],
    explicit_hostname: str | None,
) -> list[str]:
    applied: list[str] = []

    if explicit_hostname:
        updates["box.hostname"] = explicit_hostname

    for key, value in updates.items():
        if not value:
            continue
        current = _get_nested(env, key)
        if current and not overwrite:
            continue
        if current and interactive and not _ask_bool(f"Replace {key} with '{value}'", default=False):
            continue
        _set_nested(env, key, value)
        applied.append(key)

    missing = [key for key in required if not _get_nested(env, key)]
    if not missing:
        return applied

    if not interactive:
        raise SetupError(f"Missing values and --automated set: {', '.join(missing)}")

    for key in missing:
        value = _ask_text(f"Enter value for {key}")
        if value:
            _set_nested(env, key, value)
            applied.append(key)
    return applied


def _build_steps(args: argparse.Namespace) -> list[Step]:
    steps: list[Step] = []
    if not args.skip_pip:
        steps.append(Step("Install Python requirements", ["python3", "-m", "pip", "install", "-r", "requirements-dev.txt"], "python3"))
    if not args.skip_mermaid:
        steps.append(Step("Install Mermaid CLI", ["npm", "install", "--global", "@mermaid-js/mermaid-cli@11.12.0"], "npm"))
    if not args.skip_react:
        steps.append(Step("Install borrower portal UI bundle deps", ["npm", "ci", "--prefix", "los-salesforce-project/force-app/main/default/uiBundles/losreactapp"], "npm"))
    return steps


def _required_context_keys() -> list[str]:
    return [
        "box.enterpriseId",
        "box.operatorLogin",
        "box.hostname",
        "salesforce.orgAlias",
        "salesforce.orgId",
        "salesforce.myDomainUrl",
    ]


def _run_smoke(args: argparse.Namespace, env: dict[str, Any]) -> int:
    print("LOS setup smoke check: no writes and no installs will run")

    should_probe = bool(args.from_current_clis or args.smoke)
    updates = _collect_context_probe() if should_probe else {}
    command_ok = True

    if not updates:
        print("No CLI context discovered. Ensure `box` and `sf` are logged in.")
        command_ok = False

    if updates:
        print("Discovered context:")
        for key in sorted(updates):
            print(f" - {key}: {updates[key]}")
        _apply_context(env, updates, interactive=False, overwrite=args.overwrite, required=[], explicit_hostname=args.box_hostname)

    required = _required_context_keys() if should_probe else []
    missing = [key for key in required if not _get_nested(env, key)]
    if required:
        print(f"Required keys: {', '.join(required)}")
        if missing:
            print("Missing required values:")
            for key in missing:
                print(f" - {key}")
            command_ok = False
        else:
            print("Required values discovered.")

    steps = _build_steps(args)
    print("Simulated install plan:")
    for step in steps:
        has_tool = True
        if step.required_tool:
            has_tool = _command_exists(step.required_tool)
        status = "READY" if has_tool else "MISSING_TOOL"
        tool_hint = f" (tool: {step.required_tool})" if step.required_tool else ""
        print(f" - {step.title}: {status}{tool_hint}")
        if not has_tool:
            command_ok = False

    if not steps:
        print("No install steps selected.")

    if command_ok and not missing:
        print("Smoke check complete.")
        return 0

    print("Smoke check found issues.")
    return 3


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="One-command LOS setup for local dev and environment discovery")
    parser.add_argument("--config", type=Path, default=ROOT / "config/runtime/demo-environment.json")
    parser.add_argument("--example", type=Path, default=ROOT / "config/runtime/demo-environment.example.json")
    parser.add_argument("--automated", action="store_true", help="Run in automated mode (no prompts)")
    parser.add_argument("--interactive", action="store_true", help="Prompt before each install step and for missing context")
    parser.add_argument("--from-current-clis", action="store_true", help="Pull available values from current Box and Salesforce CLIs")
    parser.add_argument("--smoke", action="store_true", help="Probe environment context and print a simulated plan without applying anything")
    parser.add_argument("--box-hostname", help="Set Box hostname directly")
    parser.add_argument("--overwrite", action="store_true", help="Overwrite existing context fields from CLI probes")
    parser.add_argument("--skip-pip", action="store_true", help="Skip Python dependency install")
    parser.add_argument("--skip-mermaid", action="store_true", help="Skip Mermaid CLI install")
    parser.add_argument("--skip-react", action="store_true", help="Skip borrower portal UI bundle dependency install")
    parser.add_argument("--dry-run", action="store_true", help="Print planned actions without executing")
    parser.add_argument("--pet", choices=("auto", "on", "off"), default="auto", help="ASCII pet while running")
    return parser


def main() -> int:
    args = build_parser().parse_args()

    if args.smoke:
        args.automated = True
        args.from_current_clis = True
        args.pet = "off"
        args.interactive = False

    interactive = args.interactive or (not args.automated and sys.stdin.isatty())

    if args.pet == "on" or (args.pet == "auto" and interactive):
        _print_pet()

    mode = "interactive" if interactive else "automated"
    print(f"LOS setup mode: {mode}")

    if not args.example.exists():
        raise SetupError(f"Missing example file: {args.example}")

    if not args.config.exists():
        args.config.parent.mkdir(parents=True, exist_ok=True)
        args.config.write_text(args.example.read_text(encoding="utf-8"), encoding="utf-8")
        print(f"Created runtime config: {args.config}")

    env = json.loads(args.config.read_text(encoding="utf-8"))
    required = _required_context_keys() if args.from_current_clis else []

    if args.smoke:
        return _run_smoke(args, env)

    updates = _collect_context_probe() if args.from_current_clis else {}
    applied = _apply_context(
        env,
        updates,
        interactive=interactive,
        overwrite=args.overwrite,
        required=required,
        explicit_hostname=args.box_hostname,
    )

    if interactive and updates:
        print("Context discovery updates applied:")
        for key in sorted(applied):
            print(f" - {key}: {_get_nested(env, key)}")

    if applied:
        args.config.write_text(json.dumps(env, indent=2) + "\n", encoding="utf-8")

    steps = _build_steps(args)

    results: list[StepResult] = []
    if not steps:
        print("No dependency steps selected.")

    for index, step in enumerate(steps, start=1):
        _progress_bar(index, len(steps), step.title, "running")
        result = _run_command(step, dry_run=args.dry_run, interactive=interactive)
        results.append(result)
        if not result.ok:
            _progress_bar(index, len(steps), step.title, "error")
            print(f"  -> failed: {result.error}")
            print("Setup stopped. Re-run after resolving the issue.")
            return 2
        _progress_bar(index, len(steps), step.title, "done" if not result.skipped else "skip")

    print("\nCompleted")
    print(f"Runtime config: {args.config}")
    print("Next: run `python3 scripts/demo_operator.py doctor` and continue setup flow.")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except SetupError as error:
        print(f"ERROR: {error}")
        raise SystemExit(2)
