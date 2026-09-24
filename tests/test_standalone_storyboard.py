"""Validate portable media and canonical GitHub resource links."""
import base64
from html.parser import HTMLParser
import mimetypes
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
            self.assertGreater(count,0)
            self.assertNotIn('data-embedded-',content)
            self.assertNotIn('createObjectURL',content)
            original_tags=Links(original.decode()).attrs
            original_images=[a['src'] for a in original_tags if 'src' in a]
            embedded_images=[a['src'] for a in tags if 'src' in a]
            self.assertEqual(len(original_images),len(embedded_images))
            for relative,uri in zip(original_images,embedded_images):
                self.assertTrue(uri.startswith('data:image/'))
                self.assertEqual(base64.b64decode(uri.split(',',1)[1],validate=True),
                                 (source.parent/relative).read_bytes())
            for attrs in tags:
                for key in ('src','href'):
                    if key in attrs: self.assertTrue(attrs[key].startswith(('https://','#','data:')),attrs[key][:100])
            self.assertIn(REPO_URL+'skills/loan-origination-claude/SKILL.md', content)
            self.assertIn(REPO_URL+'output/pdf/harborview-appraisal-2026.pdf',content)
            original_image_links = [a for a in Links(original.decode()).attrs
                                    if (mimetypes.guess_type(a.get('href',''))[0] or '').startswith('image/')]
            self.assertGreater(len(original_image_links),0)
            self.assertEqual(sum(a.get('href','').startswith('data:image/') for a in tags),len(original_image_links))
            for url in re.findall(r'url\("([^"]+)"\)',content):self.assertTrue(url.startswith('data:'))
            self.assertEqual(sum(a.get('role') == 'tabpanel' for a in tags),3)
