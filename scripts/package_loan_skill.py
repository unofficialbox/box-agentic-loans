#!/usr/bin/env python3
"""Package a self-contained loan skill as a single-file archive."""
import argparse
from pathlib import Path
import re
import zipfile

ROOT = Path(__file__).resolve().parents[1]


def package(output: Path, root: Path = ROOT, skill_name: str = 'loan-origination-claude', bindings: dict[str, str] | None = None) -> Path:
    """Archive the skill; with `bindings`, render its environment placeholders first (never into the repository)."""
    skill = root / 'skills' / skill_name
    files = [skill / 'SKILL.md']
    for source in files:
        for target in re.findall(r'\[[^\]]*\]\(([^)]+)\)', source.read_text()):
            if target.startswith(('https://', 'http://', '#')):
                continue
            resolved = (source.parent / target.split('#')[0]).resolve()
            if not resolved.is_relative_to(skill.resolve()) or resolved not in [f.resolve() for f in files]:
                raise ValueError(f'Unpackaged reference in {source.name}: {target}')
    output = Path(output)
    output.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(output, 'w', zipfile.ZIP_DEFLATED) as archive:
        for source in files:
            if bindings is None:
                archive.write(source, Path(skill_name) / source.relative_to(skill))
            else:
                try:
                    from .render_skill_bindings import render
                except ImportError:
                    from render_skill_bindings import render
                archive.writestr(str(Path(skill_name) / source.relative_to(skill)), render(source.read_text(), bindings))
    return output


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', required=True, type=Path)
    parser.add_argument('--skill', default='loan-origination-claude', choices=['loan-origination-claude', 'loan-origination-quick', 'loan-origination-slack'])
    parser.add_argument('--bindings', type=Path, help='runtime defaults JSON (gitignored) whose values replace the angle-bracket environment placeholders')
    args = parser.parse_args()
    bindings = None
    if args.bindings:
        try:
            from .render_skill_bindings import load_bindings
        except ImportError:
            from render_skill_bindings import load_bindings
        bindings = load_bindings(args.bindings)
    print(package(args.output, skill_name=args.skill, bindings=bindings))
