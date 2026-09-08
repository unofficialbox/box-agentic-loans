from __future__ import annotations

import re
import shutil
import subprocess
import unittest
from pathlib import Path


ROOT = Path(__file__).parents[1]
MARKDOWN_LINK = re.compile(r"\[[^\]]+\]\(([^)]+)\)")


class RepositoryNavigationTests(unittest.TestCase):
    def test_demo_entry_points_are_linked_from_root(self):
        readme = (ROOT / "README.md").read_text()
        targets = {target.split("#", 1)[0] for target in MARKDOWN_LINK.findall(readme)}
        expected = {
            "DEMO-STORYBOARD.html",
            "skills/los-demo/SKILL.md",
            "docs/operator/start-here.md",
            "docs/operator/demo-clickpath.md",
            "docs/use-case-creator/architecture.md",
            "HANDOFF.md",
        }
        self.assertTrue(expected.issubset(targets), expected - targets)

    def test_local_markdown_links_resolve(self):
        failures: list[str] = []
        git = shutil.which("git")
        self.assertIsNotNone(git, "git executable is required for navigation tests")
        # NUL-separated with quoting off: a tracked path with a non-ASCII character is
        # otherwise returned C-quoted ("Dreamforce 2026 \342\200\224 ..."), which is not a
        # path on disk and crashes the walk before it checks a single link.
        tracked = [
            item for item in subprocess.run(
                [git, "-c", "core.quotePath=false", "ls-files", "-z", "--", "*.md"],
                cwd=ROOT,
                check=True,
                capture_output=True,
                text=True,
            ).stdout.split("\0") if item
        ]
        markdown_files = [ROOT / relative for relative in tracked]
        for source in markdown_files:
            for target in MARKDOWN_LINK.findall(source.read_text()):
                if target.startswith(("#", "http://", "https://", "mailto:")):
                    continue
                path_text = target.split("#", 1)[0]
                destination = (source.parent / path_text).resolve()
                if destination != ROOT and ROOT not in destination.parents:
                    failures.append(f"{source.relative_to(ROOT)} -> {target}")
                elif not destination.exists():
                    failures.append(f"{source.relative_to(ROOT)} -> {target}")
        self.assertEqual([], failures)


if __name__ == "__main__":
    unittest.main()
