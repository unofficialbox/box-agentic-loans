#!/usr/bin/env python3
"""Package a self-contained loan skill as a single-file archive."""
import argparse
from pathlib import Path
import re
import zipfile

ROOT = Path(__file__).resolve().parents[1]


def package(output: Path, root: Path = ROOT, skill_name: str = 'loan-origination') -> Path:
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
            archive.write(source, Path(skill_name) / source.relative_to(skill))
    return output


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', required=True, type=Path)
    parser.add_argument('--skill', default='loan-origination', choices=['loan-origination', 'loan-origination-quick'])
    args = parser.parse_args()
    print(package(args.output, skill_name=args.skill))
