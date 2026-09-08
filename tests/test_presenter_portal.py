from __future__ import annotations

import base64
import importlib.util
import re
import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts" / "build_presenter_portal.py"


def load_module():
    spec = importlib.util.spec_from_file_location("presenter_portal", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


class PresenterPortalTests(unittest.TestCase):
    def test_landing_routes_to_every_standalone_file_and_combined_edition(self) -> None:
        module = load_module()
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / "index.html"
            source = module.build_landing(target).read_text(encoding="utf-8")

        for page in module.PAGES:
            self.assertIn(f'href="{page.filename}"', source)
            self.assertIn(page.title, source)
        self.assertIn('href="06-complete-presenter-edition.html"', source)
        self.assertEqual(source.count('class="card '), len(module.PAGES))
        self.assertNotRegex(source, r'(?:src|href)=["\']https?://')

    def test_combined_edition_embeds_every_chapter_without_file_dependencies(self) -> None:
        module = load_module()
        with tempfile.TemporaryDirectory() as directory:
            source_dir = Path(directory) / "chapters"
            source_dir.mkdir()
            for index, page in enumerate(module.PAGES):
                (source_dir / page.filename).write_text(
                    f"<!doctype html><title>Fixture {index}</title><p>chapter-{index}</p>",
                    encoding="utf-8",
                )
            output = Path(directory) / "combined.html"
            first = module.build_combined(source_dir, output).read_bytes()
            second = module.build_combined(source_dir, output).read_bytes()
            document = first.decode("utf-8")

        self.assertEqual(first, second)
        self.assertEqual(document.count('"document":"'), len(module.PAGES))
        self.assertIn('id="chapter-list"', document)
        self.assertIn('id="mobile-jump"', document)
        self.assertIn('id="previous"', document)
        self.assertIn('id="next"', document)
        self.assertIn("frame.srcdoc=decode(page.document)", document)
        fixture = b"<!doctype html><title>Fixture 0</title><p>chapter-0</p>"
        self.assertIn(base64.b64encode(fixture).decode("ascii"), document)
        self.assertNotRegex(document, r'(?:src|href)=["\']https?://')


if __name__ == "__main__":
    unittest.main()
