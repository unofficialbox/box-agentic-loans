import importlib.util
import re
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts" / "build_customer_datasheet.py"


class CustomerDatasheetTests(unittest.TestCase):
    def test_builds_nontechnical_offline_datasheet(self) -> None:
        spec = importlib.util.spec_from_file_location("customer_datasheet", SCRIPT)
        module = importlib.util.module_from_spec(spec)
        assert spec.loader is not None
        spec.loader.exec_module(module)

        with tempfile.TemporaryDirectory() as directory:
            module.OUTPUT = Path(directory) / "datasheet.html"
            output = module.build()
            document = output.read_text(encoding="utf-8")

        self.assertIn("Move work forward. Decide with confidence.", document)
        self.assertNotIn("Keep people in control", document)
        self.assertIn("Move faster", document)
        self.assertIn("Reduce risk", document)
        self.assertIn("Stay in control", document)
        self.assertIn("Start with loan origination", document)
        self.assertIn("Commitment Letter · Harborview Logistics", document)
        self.assertIn("Covenants and maturities", document)
        self.assertIn("The right context for every decision.", document)
        self.assertNotIn("One experience. Your trusted systems.", document)
        self.assertNotIn("guided, intelligent experience", document)
        self.assertNotIn("trusted content", document)
        self.assertIn("Salesforce Agentforce", document)
        self.assertNotIn("Powered by governed agent orchestration", document)
        self.assertNotIn("API", document)
        self.assertNotIn("database", document.lower())
        self.assertGreaterEqual(document.count("data:image/svg+xml;base64,"), 2)
        self.assertEqual(document.count("data:image/png;base64,"), 0)
        self.assertEqual(document.count("data:image/jpeg;base64,"), 1)
        self.assertIn('alt="Box"', document)
        self.assertIn('alt="Salesforce"', document)
        for brand in ("box", "salesforce"):
            self.assertIn(f'data-brand-logo="{brand}"', document)
        self.assertIsNone(re.search(r'(?:src|href)=["\']https?://', document))

    def test_official_brand_assets_are_available(self) -> None:
        assets = ROOT / "docs" / "design" / "brand-assets"
        for filename in (
            "box-logo-blue.svg",
            "salesforce-logo.jpeg",
        ):
            with self.subTest(filename=filename):
                self.assertGreater((assets / filename).stat().st_size, 500)


if __name__ == "__main__":
    unittest.main()
