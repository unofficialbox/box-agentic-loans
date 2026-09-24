import tempfile
import unittest
from pathlib import Path
from urllib.parse import unquote, urlsplit
from scripts.build_demo_pages import build, GUIDE, Links, PUBLIC_URL, REPO_URL

class DemoPagesTests(unittest.TestCase):
    def test_public_guide_includes_resources_without_application_source(self):
        with tempfile.TemporaryDirectory() as directory:
            site = build(Path(directory) / 'site')
            for link in Links((site / GUIDE / 'index.html').read_text()).paths:
                self.assertTrue((site / GUIDE / link).is_file(), link)
            portable = (site / GUIDE / 'standalone.html').read_text()
            self.assertNotIn(REPO_URL, portable)
            self.assertIn(PUBLIC_URL + 'skills/loan-origination-claude/SKILL.md', portable)
            self.assertTrue((site / 'skills/loan-origination-claude/SKILL.md').is_file())
            self.assertTrue((site / '.env.sample').is_file())
            for path in ['.git', '.env', 'los-salesforce-project', 'scripts']:
                self.assertFalse((site / path).exists(), path)
