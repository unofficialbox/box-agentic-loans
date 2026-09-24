import contextlib
import io
import re
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

import sync_env  # noqa: E402

SAMPLE = """# header
LOS_ORG_ALIAS=<alias>
BOX_ALLOWED_FOLDER_IDS=<workspace folder id>
VITE_BOX_FOLDER_ID=<workspace folder id>
TYPESAFE_API_KEY=
TYPESAFE_MODEL=jev-latest
"""


class SyncEnvTests(unittest.TestCase):
    def test_keeps_every_existing_value_verbatim(self):
        current = 'LOS_ORG_ALIAS=demo\nBOX_ALLOWED_FOLDER_IDS=111,222\nTYPESAFE_API_KEY=\nVITE_BOX_FOLDER_ID="333"\n'
        result, report = sync_env.sync(SAMPLE, current)
        self.assertIn("LOS_ORG_ALIAS=demo\n", result)
        self.assertIn("BOX_ALLOWED_FOLDER_IDS=111,222\n", result)
        self.assertIn('VITE_BOX_FOLDER_ID="333"\n', result)
        # An empty value the user left empty stays theirs, not the sample's.
        self.assertIn("TYPESAFE_API_KEY=\n", result)
        self.assertEqual(report["added"], ["TYPESAFE_MODEL"])

    def test_adds_missing_keys_with_the_sample_placeholder(self):
        result, report = sync_env.sync(SAMPLE, "LOS_ORG_ALIAS=demo\n")
        self.assertIn("BOX_ALLOWED_FOLDER_IDS=<workspace folder id>", result)
        self.assertEqual(report["added"], ["BOX_ALLOWED_FOLDER_IDS", "VITE_BOX_FOLDER_ID", "TYPESAFE_API_KEY", "TYPESAFE_MODEL"])

    def test_drops_keys_no_code_reads(self):
        current = "LOS_ORG_ALIAS=demo\nVITE_BOX_CLOSING_FOLDER_ID=444\nVITE_BOX_APP_URL=\n"
        result, report = sync_env.sync(SAMPLE, current)
        self.assertNotIn("VITE_BOX_CLOSING_FOLDER_ID", result)
        self.assertEqual(report["removed"], ["VITE_BOX_APP_URL", "VITE_BOX_CLOSING_FOLDER_ID"])

    def test_does_not_carry_a_removed_key_into_a_new_one(self):
        result, report = sync_env.sync(SAMPLE, "LOS_BOX_FOLDER_ID=555\n")
        self.assertIn("VITE_BOX_FOLDER_ID=<workspace folder id>\n", result)
        self.assertNotIn("555", result)
        self.assertEqual(report["removed"], ["LOS_BOX_FOLDER_ID"])

    def test_adds_a_new_setting_with_the_sample_value(self):
        result, _ = sync_env.sync(SAMPLE, "")
        self.assertIn("TYPESAFE_MODEL=jev-latest\n", result)
        result, _ = sync_env.sync(SAMPLE, "TYPESAFE_MODEL=jev-2\n")
        self.assertIn("TYPESAFE_MODEL=jev-2\n", result)

    def test_write_backs_up_and_never_prints_values(self):
        with tempfile.TemporaryDirectory() as tmp:
            env, sample = Path(tmp, ".env"), Path(tmp, ".env.sample")
            sample.write_text(SAMPLE)
            env.write_text("TYPESAFE_API_KEY=super-secret-value\nVITE_BOX_DOCGEN_FOLDER_ID=777\n")
            out = io.StringIO()
            with contextlib.redirect_stdout(out):
                sync_env.main(["--env", str(env), "--sample", str(sample)])
            self.assertIn("VITE_BOX_DOCGEN_FOLDER_ID=777", env.read_text(), "dry run must not write")
            with contextlib.redirect_stdout(out):
                sync_env.main(["--env", str(env), "--sample", str(sample), "--write"])
            self.assertIn("TYPESAFE_API_KEY=super-secret-value", env.read_text())
            self.assertIn("VITE_BOX_DOCGEN_FOLDER_ID=777", Path(tmp, ".env.bak").read_text())
            self.assertNotIn("super-secret-value", out.getvalue())
            self.assertNotIn("777", out.getvalue())

    def test_repository_sample_parses_and_every_key_is_read_by_code(self):
        sample = (ROOT / ".env.sample").read_text()
        keys = {m.group(1) for line in sample.splitlines() for m in [sync_env.ACTIVE.match(line)] if m}
        self.assertIn("VITE_BOX_FOLDER_ID", keys)
        code = "\n".join(
            path.read_text(errors="ignore")
            for pattern in ("los-salesforce-project/**/*.ts", "los-salesforce-project/scripts/*", "scripts/*.py")
            for path in ROOT.glob(pattern)
            if "node_modules" not in path.parts and path.is_file()
        )
        unused = sorted(key for key in keys if not re.search(rf"\b{key}\b", code))
        self.assertEqual(unused, [])


if __name__ == "__main__":
    unittest.main()
