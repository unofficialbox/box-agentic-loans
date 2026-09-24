#!/usr/bin/env python3
"""Render a presenter skill's environment placeholders from the runtime defaults file.

The committed skills carry `<POLICY_HUB_ID>`, `<BOX_ENTERPRISE_ID>`, `<DOCGEN_TEMPLATE_ID>` and
`<SIGNER_EMAIL>` so no environment value is ever committed. Slackbot loads nothing but the
pasted primer, so a placeholder left in it is repeated back verbatim and the presenter has to
type the Hub ID by hand. This script fills the placeholders from
config/runtime/quick-demo-defaults.json (gitignored) and writes the result under
config/runtime/generated/ (also gitignored), or prints one section for pasting.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PLACEHOLDERS = {
    "<BOX_ENTERPRISE_ID>": "boxEnterpriseId",
    "<POLICY_HUB_ID>": "creditPolicyHubId",
    "<DOCGEN_TEMPLATE_ID>": "docgenCommitmentLetterTemplateId",
    "<SIGNER_EMAIL>": "signerEmail",
}
SKILLS = ("loan-origination-slack", "loan-origination-quick", "loan-origination-claude")
SECTIONS = {"primer": "## Primer", "docgen": "## Doc Gen contract"}
DEFAULT_BINDINGS = ROOT / "config" / "runtime" / "quick-demo-defaults.json"
GENERATED = ROOT / "config" / "runtime" / "generated"


def load_bindings(path: Path) -> dict[str, str]:
    data = json.loads(path.read_text(encoding="utf-8"))
    return {key: str(data.get(key, "") or "").strip() for key in PLACEHOLDERS.values()}


def render(text: str, bindings: dict[str, str], *, allow_blank: bool = False) -> str:
    missing = [
        placeholder for placeholder, key in PLACEHOLDERS.items()
        if placeholder in text and not bindings.get(key, "").strip()
    ]
    if missing and not allow_blank:
        raise ValueError(
            "Blank bindings for " + ", ".join(missing) + "; fill them in the runtime defaults file"
        )
    for placeholder, key in PLACEHOLDERS.items():
        value = bindings.get(key, "").strip()
        if value:
            text = text.replace(placeholder, value)
    return text


def section_block(text: str, section: str) -> str:
    """The contents of the first fenced block under the named section heading."""
    heading = SECTIONS[section]
    start = text.find(f"\n{heading}\n")
    if start < 0:
        raise ValueError(f"Section {heading!r} not found")
    match = re.search(r"```\n(.*?)\n```", text[start:], re.S)
    if not match:
        raise ValueError(f"No fenced block under {heading!r}")
    return match.group(1)


def render_skill(
    skill: str,
    bindings: dict[str, str],
    *,
    root: Path = ROOT,
    section: str = "all",
    allow_blank: bool = False,
) -> str:
    text = (root / "skills" / skill / "SKILL.md").read_text(encoding="utf-8")
    if section != "all":
        text = section_block(text, section)
    return render(text, bindings, allow_blank=allow_blank)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--skill", default="loan-origination-slack", choices=SKILLS)
    parser.add_argument("--bindings", type=Path, default=DEFAULT_BINDINGS, help="runtime defaults JSON (gitignored)")
    parser.add_argument("--section", default="all", choices=("all", *SECTIONS), help="render one pasteable block instead of the whole file")
    parser.add_argument("--output", type=Path, help=f"where to write; default {GENERATED.relative_to(ROOT)}/<skill>[-<section>].md")
    parser.add_argument("--print", action="store_true", help="write to stdout instead of a file")
    parser.add_argument("--allow-blank", action="store_true", help="leave placeholders whose binding is blank")
    args = parser.parse_args(argv)

    if not args.bindings.exists():
        print(f"Runtime defaults not found: {args.bindings}. Copy config/runtime/quick-demo-defaults.example.json and fill it.", file=sys.stderr)
        return 2
    try:
        rendered = render_skill(args.skill, load_bindings(args.bindings), section=args.section, allow_blank=args.allow_blank)
    except ValueError as error:
        print(str(error), file=sys.stderr)
        return 2
    if args.print:
        sys.stdout.write(rendered if rendered.endswith("\n") else rendered + "\n")
        return 0
    suffix = "" if args.section == "all" else f"-{args.section}"
    output = args.output or GENERATED / f"{args.skill}{suffix}.md"
    if (ROOT / "skills") in output.resolve().parents:
        print("Refusing to write rendered bindings into skills/; they belong under config/runtime/generated/.", file=sys.stderr)
        return 2
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(rendered if rendered.endswith("\n") else rendered + "\n", encoding="utf-8")
    print(output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
