from __future__ import annotations

import re
import unittest
from pathlib import Path


ROOT = Path(__file__).parents[1]
ABSOLUTE_PATH = re.compile(
    r"(?:^|[\s`\"'(])(?:~/[^\s`\"')]+|[A-Za-z]:[\\/][^\s`\"')]+|/(?!/)[^\s`\"')]+)",
    re.MULTILINE,
)
PERSONAS = {"maintainer", "operator", "use-case-creator"}


class AiInstructionTests(unittest.TestCase):
    def test_each_assistant_has_exactly_three_personas(self):
        expected = {
            ".codex/personas": ".md",
            ".claude/personas": ".md",
            ".cursor/rules": ".mdc",
        }
        for directory, suffix in expected.items():
            root = ROOT / directory
            found = {
                path.stem
                for path in root.glob(f"*{suffix}")
                if path.stem != "00-repository-router"
            }
            self.assertEqual(PERSONAS, found, directory)

    def test_instruction_files_use_portable_paths(self):
        files = [ROOT / "AGENTS.md", ROOT / "CLAUDE.md"]
        files.extend((ROOT / ".codex").rglob("*.md"))
        files.extend((ROOT / ".claude").rglob("*.md"))
        files.extend((ROOT / ".cursor").rglob("*.mdc"))
        for path in files:
            self.assertIsNone(ABSOLUTE_PATH.search(path.read_text()), path)

    def test_routers_request_one_persona_and_bounded_reading(self):
        for path in (
            ROOT / "AGENTS.md",
            ROOT / "CLAUDE.md",
            ROOT / ".cursor/rules/00-repository-router.mdc",
        ):
            text = path.read_text()
            self.assertIn("exactly one persona", text)
            self.assertIn("Never load", text)


if __name__ == "__main__":
    unittest.main()
