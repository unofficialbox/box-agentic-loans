import importlib.util
import sys
from pathlib import Path
from unittest.mock import patch

from typing import Any

import unittest

MODULE_PATH = Path(__file__).resolve().parents[1] / "scripts/setup_los_dev.py"
SPEC = importlib.util.spec_from_file_location("setup_los_dev", MODULE_PATH)
setup_los_dev = importlib.util.module_from_spec(SPEC)
sys.modules["setup_los_dev"] = setup_los_dev
assert SPEC.loader
SPEC.loader.exec_module(setup_los_dev)


class SetupLosDevTests(unittest.TestCase):
    def test_apply_context_prompts_for_missing_required_in_interactive_mode(self) -> None:
        env = {
            "box": {"parentFolderId": "", "operatorLogin": "", "enterpriseId": "", "hostname": ""},
            "salesforce": {"orgAlias": "", "orgId": "", "myDomainUrl": ""},
        }
        with patch("builtins.input", side_effect=["user@example.com", "123", "box.example.com", "alias", "00D123", "https://my.salesforce.com"]):
            setup_los_dev._apply_context(
                env,
                updates={},
                interactive=True,
                overwrite=False,
                required=["box.operatorLogin", "box.enterpriseId", "box.hostname", "salesforce.orgAlias", "salesforce.orgId", "salesforce.myDomainUrl"],
                explicit_hostname=None,
            )

        self.assertEqual(env["box"]["operatorLogin"], "user@example.com")
        self.assertEqual(env["box"]["enterpriseId"], "123")
        self.assertEqual(env["box"]["hostname"], "box.example.com")
        self.assertEqual(env["salesforce"]["orgAlias"], "alias")

    def test_apply_context_rejects_missing_values_in_automated_mode(self) -> None:
        env = {"box": {"operatorLogin": "", "enterpriseId": "", "hostname": "", "parentFolderId": ""}, "salesforce": {"orgAlias": "", "orgId": "", "myDomainUrl": ""}}
        with self.assertRaises(setup_los_dev.SetupError):
            setup_los_dev._apply_context(
                env,
                updates={},
                interactive=False,
                overwrite=False,
                required=["box.operatorLogin", "box.enterpriseId", "box.hostname", "salesforce.orgAlias", "salesforce.orgId", "salesforce.myDomainUrl"],
                explicit_hostname=None,
            )

    def test_collect_context_probe_uses_parsed_json(self) -> None:
        with patch.object(
            setup_los_dev,
            "_json_or_none",
            side_effect=[
                {"login": "boxuser", "enterprise": {"id": "999"}},
                {
                    "result": {
                        "alias": "my-org",
                        "id": "00Dabc",
                        "instanceUrl": "https://my.salesforce.com",
                        "username": "ops@company.com",
                    }
                },
            ],
        ):
            updates = setup_los_dev._collect_context_probe()
        self.assertEqual(updates["box.operatorLogin"], "boxuser")
        self.assertEqual(updates["box.enterpriseId"], "999")
        self.assertEqual(updates["salesforce.orgAlias"], "my-org")
        self.assertEqual(updates["salesforce.operatorUsername"], "ops@company.com")

    def test_build_parser_defaults_to_setup_mode(self) -> None:
        parser = setup_los_dev.build_parser()
        args = parser.parse_args([])
        self.assertEqual(args.config.name, "demo-environment.json")
        self.assertFalse(args.automated)
        self.assertFalse(args.smoke)
        self.assertFalse(args.from_current_clis)

    def test_smoke_mode_reports_success(self) -> None:
        with patch.object(
            setup_los_dev,
            "_collect_context_probe",
            return_value={
                "box.operatorLogin": "box-user",
                "box.enterpriseId": "12345",
                "salesforce.orgAlias": "my-org",
                "salesforce.orgId": "00D123",
                "salesforce.myDomainUrl": "https://my.salesforce.com",
            },
        ), patch.object(setup_los_dev, "_command_exists", return_value=True):
            parser = setup_los_dev.build_parser()
            args = parser.parse_args(["--smoke"])
            env = {
                "box": {"operatorLogin": "", "enterpriseId": "", "hostname": "example.box.com", "parentFolderId": ""},
                "salesforce": {"orgAlias": "", "orgId": "", "myDomainUrl": ""},
            }
            code = setup_los_dev._run_smoke(args, env)
        self.assertEqual(code, 0)
        self.assertEqual(env["box"]["operatorLogin"], "box-user")
        self.assertEqual(env["salesforce"]["orgAlias"], "my-org")


if __name__ == "__main__":
    unittest.main()
