from __future__ import annotations

import importlib.util
import json
import sys
import tempfile
import unittest
from datetime import UTC, date, datetime
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
MODULE_PATH = ROOT / "scripts" / "validate_los.py"
SPEC = importlib.util.spec_from_file_location("validate_los", MODULE_PATH)
validation = importlib.util.module_from_spec(SPEC)
assert SPEC.loader
sys.modules[SPEC.name] = validation
SPEC.loader.exec_module(validation)


class LOSValidationTests(unittest.TestCase):
    def test_json_schema_and_link_checks_cover_repository_sources(self) -> None:
        json_detail = validation.check_json_and_schemas()
        link_detail = validation.check_local_links()
        self.assertGreater(int(json_detail.split()[0]), 0)
        self.assertGreater(int(link_detail.split()[0]), 0)

    def test_broken_local_link_is_reported(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "README.md").write_text("[Missing](docs/nope.md)", encoding="utf-8")
            with self.assertRaisesRegex(validation.ValidationError, "Broken local Markdown links"):
                validation.check_local_links(root)

    def test_secret_and_live_environment_values_are_reported(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "unsafe.toml").write_text(
                'client' + 'Secret="not-safe"\nurl="https://tenant' + '.ent.box.com/folder/1"',
                encoding="utf-8",
            )
            with self.assertRaisesRegex(validation.ValidationError, "Secrets or environment-bound values"):
                validation.check_secrets_and_runtime_ids(root)

    def test_screenshot_manifest_matches_disk(self) -> None:
        # The manifest must agree with the files on disk (MT-072); an empty inventory is
        # tolerated and reported as capture pending, a populated one is counted.
        # The clock is the newest capture in the manifest, so re-capturing screens never
        # turns this into a test of the calendar; the freshness rule itself is exercised
        # against a date the manifest actually carries.
        manifest = validation.bcl.load_bcl(ROOT / "config" / "demo" / "screenshot-manifest.bcl")
        newest = max(
            (date.fromisoformat(entry["capturedOn"]) for entry in manifest.get("screenshots", [])),
            default=date(2026, 9, 4),
        )
        detail = validation.check_screenshot_manifest(ROOT, today=newest)
        self.assertRegex(detail, r"(\d+ current real screenshots|0 screenshots \(capture pending\))")

    def test_reset_and_idempotency_rules_are_present(self) -> None:
        self.assertIn("portable retry", validation.check_reset_and_idempotency_rules())

    def test_repository_mode_skips_live_receipts(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            self.assertTrue(validation.check_live_receipts(Path(directory), required=False).startswith("SKIP:"))
            with self.assertRaisesRegex(validation.ValidationError, "Presenter-ready validation requires"):
                validation.check_live_receipts(Path(directory), required=True)

    def test_presenter_ready_receipts_require_all_current_platforms(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            runtime = root / "config" / "runtime"
            runtime.mkdir(parents=True)
            receipts = {
                "freshnessDays": 30,
                "receipts": [
                    {
                        "platform": platform,
                        "environment": "current-demo",
                        "validatedAt": datetime.now(UTC).isoformat(),
                        "actionMode": "live",
                        "businessKey": "LN-2026-0042",
                        "status": "passed",
                        "evidence": "external-run-log-17",
                        "cleanupOwner": "demo-operator",
                    }
                    for platform in ("Box", "Salesforce")
                ],
            }
            (runtime / "validation-receipts.json").write_text(json.dumps(receipts), encoding="utf-8")
            detail = validation.check_live_receipts(root, required=True)
            for platform in ("Box", "Salesforce"):
                self.assertIn(platform, detail)
                receipt = next(item for item in receipts["receipts"] if item["platform"] == platform)
                self.assertEqual("passed", receipt["status"])
                self.assertEqual("live", receipt["actionMode"])
                self.assertEqual("current-demo", receipt["environment"])

    def test_presenter_ready_receipts_reject_non_live_action_modes(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            runtime = root / "config" / "runtime"
            runtime.mkdir(parents=True)
            receipts = {
                "receipts": [
                    {
                        "platform": platform,
                        "environment": "current-demo",
                        "validatedAt": datetime.now(UTC).isoformat(),
                        "actionMode": "mock" if platform == "Salesforce" else "live",
                        "businessKey": "LN-2026-0042",
                        "status": "passed",
                        "evidence": "external-run-log-17",
                        "cleanupOwner": "demo-operator",
                    }
                    for platform in ("Box", "Salesforce")
                ]
            }
            (runtime / "validation-receipts.json").write_text(json.dumps(receipts), encoding="utf-8")
            with self.assertRaisesRegex(validation.ValidationError, "coverage is incomplete"):
                validation.check_live_receipts(root, required=True)

    def test_presenter_ready_receipts_are_scanned_for_secrets(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            runtime = root / "config" / "runtime"
            runtime.mkdir(parents=True)
            (runtime / "validation-receipts.json").write_text(
                '{"access' + 'Token":"not-safe","receipts":[]}',
                encoding="utf-8",
            )
            with self.assertRaisesRegex(validation.ValidationError, "Secrets found in live receipts"):
                validation.check_live_receipts(root, required=True)

    def test_execute_records_failure_without_stopping_matrix(self) -> None:
        ran: list[str] = []
        results = [
            validation.execute("expected", lambda: (_ for _ in ()).throw(validation.ValidationError("boom"))),
            validation.execute("after failure", lambda: ran.append("ran") or "complete"),
        ]
        self.assertEqual("FAIL", results[0].status)
        self.assertEqual("boom", results[0].detail)
        self.assertEqual("PASS", results[1].status)
        self.assertEqual(["ran"], ran)


if __name__ == "__main__":
    unittest.main()
