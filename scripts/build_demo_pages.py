#!/usr/bin/env python3
"""Stage only the demo guide and its explicitly linked resources for public Pages."""
import argparse
from html.parser import HTMLParser
from pathlib import Path
import shutil
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parents[1]
GUIDE = Path('docs/demo-storyboard')
PUBLIC_URL = 'https://unofficialbox.github.io/box-claudeforce-loans/'
REPO_URL = 'https://github.com/unofficialbox/box-claudeforce-loans/blob/main/'

class Links(HTMLParser):
    def __init__(self, content):
        super().__init__()
        self.paths = set()
        self.feed(content)

    def handle_starttag(self, tag, attrs):
        for name, value in attrs:
            if name not in ('href', 'src') or not value:
                continue
            url = urlsplit(value)
            if not url.scheme and not url.netloc and url.path:
                self.paths.add(unquote(url.path))


def build(destination, root=ROOT):
    root = root.resolve()
    destination = Path(destination).resolve()
    destination.mkdir(parents=True, exist_ok=False)
    shutil.copytree(root / GUIDE, destination / GUIDE)
    for link in Links((root / GUIDE / 'index.html').read_text()).paths:
        source = (root / GUIDE / link).resolve()
        if not source.is_relative_to(root) or not source.is_file():
            raise ValueError(f'Invalid public resource: {link}')
        relative = source.relative_to(root)
        target = destination / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, target)
    # Keep previously shared download URLs working without treating archives as new fixtures.
    legacy = root / GUIDE / 'legacy'
    if legacy.is_dir():
        for source in legacy.rglob('*'):
            if source.is_file():
                target = destination / 'output' / source.relative_to(legacy)
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(source, target)
    standalone = destination / GUIDE / 'standalone.html'
    standalone.write_text(standalone.read_text().replace(REPO_URL, PUBLIC_URL))
    (destination / '.nojekyll').touch()
    (destination / 'index.html').write_text('<!doctype html><meta charset="utf-8"><title>Loan Origination Demo</title><meta http-equiv="refresh" content="0;url=docs/demo-storyboard/index.html"><a href="docs/demo-storyboard/index.html">Open Loan Origination Demo</a>')
    return destination

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, required=True)
    print(build(parser.parse_args().output))
