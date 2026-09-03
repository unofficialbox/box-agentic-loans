import importlib.util
import tempfile
import unittest
from pathlib import Path


MODULE_PATH = Path(__file__).parents[1] / "scripts/bcl.py"
SPEC = importlib.util.spec_from_file_location("bcl", MODULE_PATH)
bcl = importlib.util.module_from_spec(SPEC)
assert SPEC.loader
SPEC.loader.exec_module(bcl)

ROOT = Path(__file__).parents[1]
CONFIG = ROOT / "config"


class BCLLoaderTests(unittest.TestCase):
    def test_unwraps_config_payload_from_envelope(self):
        text = """
        # comment
        locals {
          "bcl" = {
            "context" = "loans"
            "resources" = [
              {
                "config" = {
                  "artifact_name" = "sample"
                  "count" = 3
                  "threshold" = 0.85
                  "enabled" = true
                  "disabled" = false
                  "empty" = null
                }
              }
            ]
          }
        }
        """
        inventory = bcl.parse_bcl(text)
        payload = inventory["resources"][0]["config"]
        self.assertEqual(payload["count"], 3)
        self.assertEqual(payload["threshold"], 0.85)
        self.assertIs(payload["enabled"], True)
        self.assertIs(payload["disabled"], False)
        self.assertIsNone(payload["empty"])

    def test_keeps_interpolation_strings_verbatim(self):
        text = 'locals { "bcl" = { "resources" = [ { "config" = { "login" = "${box.reviewers.primary}" } } ] } }'
        payload = bcl.parse_bcl(text)["resources"][0]["config"]
        self.assertEqual(payload["login"], "${box.reviewers.primary}")

    def test_parses_newline_separated_arrays_without_commas(self):
        text = """
        locals { "bcl" = { "resources" = [ { "config" = {
          "rules" = [
            "first"
            "second"
            "third"
          ]
          "nested" = [ { "a" = 1 } { "a" = 2 } ]
        } } ] } }
        """
        payload = bcl.parse_bcl(text)["resources"][0]["config"]
        self.assertEqual(payload["rules"], ["first", "second", "third"])
        self.assertEqual(payload["nested"], [{"a": 1}, {"a": 2}])

    def test_decodes_string_escapes(self):
        text = r'locals { "bcl" = { "resources" = [ { "config" = { "path" = "a\/b" "quote" = "say \"hi\"" } } ] } }'
        payload = bcl.parse_bcl(text)["resources"][0]["config"]
        self.assertEqual(payload["path"], "a/b")
        self.assertEqual(payload["quote"], 'say "hi"')

    def test_missing_bcl_block_raises(self):
        with self.assertRaises(bcl.BCLError):
            bcl.parse_bcl('locals { "other" = { } }')

    def test_load_bcl_on_empty_resources_raises(self):
        with tempfile.TemporaryDirectory() as directory:
            empty = Path(directory) / "empty.bcl"
            empty.write_text('locals { "bcl" = { "resources" = [] } }', encoding="utf-8")
            with self.assertRaises(bcl.BCLError):
                bcl.load_bcl(empty)

    def test_every_repository_bcl_file_loads_as_a_dict(self):
        files = sorted(CONFIG.rglob("*.bcl"))
        self.assertGreater(len(files), 0)
        for path in files:
            config = bcl.load_bcl(path)
            self.assertIsInstance(config, dict, f"{path} did not yield a config object")

    def test_known_payload_keys_are_present(self):
        templates = bcl.load_bcl(CONFIG / "box" / "metadata-templates.bcl")
        self.assertIn("templates", templates)
        routing = bcl.load_bcl(CONFIG / "los" / "expert-routing.bcl")
        self.assertIn("routes", routing)
        self.assertEqual(routing["confidenceThreshold"], 0.85)
        self.assertEqual(routing["fallback"]["directoryKey"], "credit-admin-triage")
        finding = bcl.load_bcl(CONFIG / "los" / "underwriting-finding.schema.bcl")
        self.assertEqual(finding["title"], "LOS Underwriting Finding")
        self.assertEqual(finding["properties"]["findingId"]["pattern"], "^UWF-[0-9]{3,}$")
        self.assertIn("applicationFileId", finding["required"])
        manifest = bcl.load_bcl(CONFIG / "demo" / "screenshot-manifest.bcl")
        self.assertEqual(manifest["screenshots"], [])
        self.assertIn("MT-072", manifest["captureStatus"])


if __name__ == "__main__":
    unittest.main()
