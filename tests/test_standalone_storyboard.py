"""Validate portable media and canonical GitHub resource links."""
import base64
import hashlib
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import tempfile
import unittest
from scripts.build_standalone_storyboard import build, GUIDE, REPO_URL

class Links(HTMLParser):
    def __init__(self, text):
        super().__init__(); self.attrs=[]; self.feed(text)
    def handle_starttag(self, tag, attrs): self.attrs.append(dict(attrs))

class StandaloneStoryboardTests(unittest.TestCase):
    def test_portable_copy_keeps_original_and_embeds_media(self):
        source=GUIDE/'index.html'; original=source.read_bytes()
        with tempfile.TemporaryDirectory() as folder:
            dest=Path(folder)/'standalone.html'; count=build(source,dest)
            self.assertEqual(source.read_bytes(),original)
            content=dest.read_text(); tags=Links(content).attrs
            manifest=json.loads(re.search(r'<script id="embedded-files" type="application/json">(.*?)</script>',content,re.S).group(1))
            self.assertEqual(count,len(manifest))
            for key,asset in manifest.items():
                self.assertEqual(hashlib.sha256(base64.b64decode(asset['data'])).hexdigest(),key)
            for attrs in tags:
                if 'data-embedded-src' in attrs: self.assertIn(attrs['data-embedded-src'],manifest)
                for key in ('src','href'):
                    if key in attrs: self.assertTrue(attrs[key].startswith(('https://','#','data:')),attrs[key])
            self.assertIn(REPO_URL+'skills/loan-origination/SKILL.md', content)
            self.assertIn(REPO_URL+'output/pdf/dockwright-appraisal-2026.pdf',content)
            self.assertNotIn('data-embedded-href',content)
            for url in re.findall(r'url\("([^"]+)"\)',content):self.assertTrue(url.startswith('data:'))
            self.assertEqual(sum(a.get('role') == 'tabpanel' for a in tags),3)
