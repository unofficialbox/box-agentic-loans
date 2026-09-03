import importlib.util
import re
import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = ROOT / "scripts"


def load_script(name: str):
    spec = importlib.util.spec_from_file_location(name, SCRIPTS / f"{name}.py")
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


class HTMLBrandingTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        sys.path.insert(0, str(SCRIPTS))

    @classmethod
    def tearDownClass(cls) -> None:
        sys.path.pop(0)

    def test_scenario_guides_embed_the_correct_official_logos(self) -> None:
        module = load_script("build_scenario_guides")
        expected = {
            "operator-setup": {"box", "salesforce"},
            "box-salesforce-los": {
                "box",
                "salesforce",
            },
        }
        with tempfile.TemporaryDirectory() as directory:
            module.OUTPUT = Path(directory)
            for scenario in module.SCENARIOS:
                document = module.build_scenario(scenario).read_text(encoding="utf-8")
                actual = set(re.findall(r'data-brand-logo="([^"]+)"', document))
                self.assertEqual(actual, expected[scenario["slug"]])
                self.assertIsNone(re.search(r'(?:src|href)=["\']https?://', document))

    def test_scenario_galleries_embed_the_correct_official_logos(self) -> None:
        module = load_script("build_los_experience_gallery")
        expected = {
            "box-salesforce-los": {
                "box",
                "salesforce",
            },
        }
        with tempfile.TemporaryDirectory() as directory:
            module.OUTPUT = Path(directory)
            for scenario in module.SCENARIOS:
                document = module.build_scenario(scenario).read_text(encoding="utf-8")
                actual = set(re.findall(r'data-brand-logo="([^"]+)"', document))
                self.assertEqual(actual, expected[scenario["slug"]])
                self.assertIsNone(re.search(r'(?:src|href)=["\']https?://', document))


if __name__ == "__main__":
    unittest.main()
