"""The Amazon Quick edition of the guide: same structure, Quick harness, Quick trio."""
from html.parser import HTMLParser
import json
from pathlib import Path
import tempfile
import unittest
from urllib.parse import unquote, urlsplit

from scripts.build_standalone_storyboard import build as build_standalone, REPO_URL

ROOT = Path(__file__).resolve().parents[1]
GUIDE = ROOT / 'docs/demo-storyboard'


class Page(HTMLParser):
    def __init__(self, content):
        super().__init__(); self.tags = []; self.feed(content)
    def handle_starttag(self, tag, attrs):
        self.tags.append((tag, dict(attrs)))


class QuickStoryboardTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.content = (GUIDE / 'index-quick.html').read_text()
        cls.page = Page(cls.content)

    def test_links_and_assets_resolve(self):
        ids = {a['id'] for _, a in self.page.tags if 'id' in a}
        for _, attrs in self.page.tags:
            for attr in ['href', 'src']:
                value = attrs.get(attr)
                if not value:
                    continue
                parsed = urlsplit(value)
                if parsed.scheme:
                    continue
                if parsed.path:
                    self.assertTrue((GUIDE / unquote(parsed.path)).is_file(), value)
                elif parsed.fragment:
                    self.assertIn(parsed.fragment, ids)

    def test_quick_edition_presents_the_quick_harness(self):
        steps = json.loads((GUIDE / 'storyboard.json').read_text())
        ids = [a.get('id') for _, a in self.page.tags]
        for step in steps:
            self.assertIn(f"step-{step['number']}", ids)
        self.assertEqual(self.content.count('Tell — business value'), len(steps))
        self.assertIn('<title>Loan Origination Demo · Amazon Quick</title>', self.content)
        self.assertIn('src="platform-trio-quick.svg"', self.content)
        self.assertIn('skills/loan-origination-quick/SKILL.md', self.content)
        self.assertIn('Amazon Quick: “', self.content)
        self.assertNotIn('Claude: “', self.content)
        self.assertIn('captured in Claude Desktop', self.content)
        self.assertIn('href="index.html"', self.content)
        self.assertIn('href="index-quick.html"', (GUIDE / 'index.html').read_text())

    def test_quick_trio_swaps_only_the_middle_card(self):
        quick = (GUIDE / 'platform-trio-quick.svg').read_text()
        claude = (GUIDE / 'platform-trio.svg').read_text()
        self.assertIn('aria-label="Amazon Quick"', quick)
        self.assertIn('amazon-quick-icon-', quick)
        self.assertNotIn('claude-logo-', quick)
        self.assertIn('claude-logo-', claude)
        self.assertNotIn('amazon-quick-icon-', claude)
        for shared in ('aria-label="Content &amp; intelligence"', 'aria-label="Records &amp; control"', 'aria-label="MCP"', 'aria-label="Unstructured data in Box"'):
            self.assertIn(shared, quick)
            self.assertIn(shared, claude)
        self.assertTrue((GUIDE / 'platform-trio-quick.png').is_file())

    def test_quick_standalone_embeds_and_links_to_github(self):
        with tempfile.TemporaryDirectory() as folder:
            dest = Path(folder) / 'standalone-quick.html'
            self.assertGreater(build_standalone(GUIDE / 'index-quick.html', dest), 0)
            content = dest.read_text()
            self.assertIn(REPO_URL + 'skills/loan-origination-quick/SKILL.md', content)
            for attrs in (a for _, a in Page(content).tags):
                for key in ('src', 'href'):
                    if key in attrs:
                        self.assertTrue(attrs[key].startswith(('https://', '#', 'data:')), attrs[key][:80])
