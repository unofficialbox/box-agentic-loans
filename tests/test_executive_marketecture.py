import importlib.util
import re
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts" / "build_executive_marketecture.py"


class ExecutiveMarketectureTests(unittest.TestCase):
    def test_builds_offline_target_architecture(self) -> None:
        spec = importlib.util.spec_from_file_location("executive_marketecture", SCRIPT)
        module = importlib.util.module_from_spec(spec)
        assert spec.loader is not None
        spec.loader.exec_module(module)

        with tempfile.TemporaryDirectory() as directory:
            module.OUTPUT = Path(directory) / "marketecture.html"
            output = module.build()
            document = output.read_text(encoding="utf-8")

        self.assertIn("Governed loan file foundation", document)
        self.assertIn("Salesforce Agentforce", document)
        self.assertNotIn("Optional orchestration", document)
        self.assertIn("Governed loan origination, accelerated by AI.", document)
        # A proof card embeds a PNG only when its capture exists on disk (MT-072); every
        # other card renders the capture-pending placeholder, so nothing is fabricated.
        captured = sum(1 for item in module.PROOF if item["path"].is_file())
        # Each captured PNG is embedded twice: once in its proof card and once in the lightbox.
        self.assertEqual(document.count("data:image/png;base64,"), captured * 2)
        self.assertEqual(document.count("<strong>Screen capture pending</strong>"), len(module.PROOF) - captured)
        self.assertEqual(document.count("data:image/jpeg;base64,"), 1)
        self.assertGreaterEqual(document.count("data:image/svg+xml;base64,"), 1)
        for brand in ("box", "salesforce"):
            self.assertIn(f'data-brand-logo="{brand}"', document)
        self.assertIsNone(re.search(r'(?:src|href)=["\']https?://', document))


if __name__ == "__main__":
    unittest.main()
