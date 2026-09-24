import tempfile
import unittest
from pathlib import Path
import shutil
import zipfile
from scripts.package_loan_skill import package, ROOT


class LoanSkillPackageTests(unittest.TestCase):
    def fixture(self, root):
        for name in ['skills/loan-origination-claude/SKILL.md', 'skills/loan-origination-quick/SKILL.md', 'skills/loan-origination-slack/SKILL.md']:
            target = root / name
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(ROOT / name, target)

    def test_archive_contains_only_self_contained_entrypoint(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            self.fixture(root)
            output = package(root / 'loan.skill', root)
            with zipfile.ZipFile(output) as archive:
                self.assertEqual(set(archive.namelist()), {
                    'loan-origination-claude/SKILL.md',
                })
                self.assertEqual(archive.read('loan-origination-claude/SKILL.md'),
                                 (ROOT / 'skills/loan-origination-claude/SKILL.md').read_bytes())

    def test_quick_archive_contains_only_its_entrypoint(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            self.fixture(root)
            output = package(root / 'quick.skill', root, skill_name='loan-origination-quick')
            with zipfile.ZipFile(output) as archive:
                self.assertEqual(set(archive.namelist()), {'loan-origination-quick/SKILL.md'})

    def test_slack_archive_contains_only_its_entrypoint(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            self.fixture(root)
            output = package(root / 'slack.skill', root, skill_name='loan-origination-slack')
            with zipfile.ZipFile(output) as archive:
                self.assertEqual(set(archive.namelist()), {'loan-origination-slack/SKILL.md'})

    def test_rejects_dependency_outside_the_archive(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            self.fixture(root)
            entry = root / 'skills/loan-origination-claude/SKILL.md'
            with entry.open('a') as stream:
                stream.write('\n[missing](../../docs/unpackaged.md)\n')
            with self.assertRaisesRegex(ValueError, 'Unpackaged reference'):
                package(root / 'bad.skill', root)
            self.assertFalse((root / 'bad.skill').exists())
