"""Rendered primers carry the environment bindings; committed skills never do."""
import re
import tempfile
import unittest
from pathlib import Path

from scripts.render_skill_bindings import GENERATED, PLACEHOLDERS, ROOT, main, render, render_skill, section_block

BINDINGS = {
    'boxEnterpriseId': '123456',
    'creditPolicyHubId': '987654321',
    'docgenCommitmentLetterTemplateId': '246822413',
    'signerEmail': 'dana.whitfield@example.com',
}
SLACK = ROOT / 'skills' / 'loan-origination-slack' / 'SKILL.md'


class RenderSkillBindingsTests(unittest.TestCase):
    def test_committed_skills_keep_placeholders_out_of_prompts(self):
        text = SLACK.read_text()
        primer = section_block(text, 'primer')
        for placeholder in PLACEHOLDERS:
            self.assertIn(placeholder, primer, placeholder)
        prompts = re.findall(r'^\| \S+ \| `([^`]+)`', text, re.M)
        self.assertGreaterEqual(len(prompts), 5)
        for prompt in prompts:
            self.assertNotIn('<', prompt, prompt)

    def test_render_fills_every_placeholder_and_refuses_blanks(self):
        rendered = render_skill('loan-origination-slack', BINDINGS)
        for placeholder in PLACEHOLDERS:
            self.assertNotIn(placeholder, rendered)
        self.assertIn('Credit Policy Hub ID 987654321', rendered)
        self.assertIn('signer dana.whitfield@example.com', rendered)
        with self.assertRaisesRegex(ValueError, '<POLICY_HUB_ID>'):
            render('hub <POLICY_HUB_ID>', {**BINDINGS, 'creditPolicyHubId': ''})
        self.assertEqual(render('hub <POLICY_HUB_ID>', {**BINDINGS, 'creditPolicyHubId': ''}, allow_blank=True), 'hub <POLICY_HUB_ID>')

    def test_sections_render_as_pasteable_blocks(self):
        primer = render_skill('loan-origination-slack', BINDINGS, section='primer')
        self.assertTrue(primer.startswith('You are presenting'))
        self.assertNotIn('```', primer)
        self.assertIn('Box enterprise ID 123456', primer)
        docgen = render_skill('loan-origination-slack', BINDINGS, section='docgen')
        self.assertIn('file_id 246822413', docgen)
        self.assertNotIn('<DOCGEN_TEMPLATE_ID>', docgen)

    def test_slack_skill_carries_demo_setup_bindings_like_quick(self):
        text = SLACK.read_text()
        self.assertIn('## Demo Setup (session bindings)', text)
        for placeholder in PLACEHOLDERS:
            self.assertIn(f'| `{placeholder}` |', text, placeholder)
        self.assertIn('ask the operator for all four in one message, once', text)
        rendered = render_skill('loan-origination-slack', BINDINGS)
        self.assertIn('| Credit Policy Hub ID | `987654321` |', rendered)

    def test_package_renders_bindings_into_the_archive_only(self):
        import zipfile
        from scripts.package_loan_skill import package
        with tempfile.TemporaryDirectory() as directory:
            output = package(Path(directory) / 'slack.skill', skill_name='loan-origination-slack', bindings=BINDINGS)
            with zipfile.ZipFile(output) as archive:
                text = archive.read('loan-origination-slack/SKILL.md').decode()
        self.assertNotIn('<POLICY_HUB_ID>', text)
        self.assertIn('987654321', text)
        self.assertIn('<POLICY_HUB_ID>', SLACK.read_text())

    def test_quick_skill_renders_with_the_same_file(self):
        rendered = render_skill('loan-origination-quick', BINDINGS)
        self.assertNotIn('<POLICY_HUB_ID>', rendered)
        self.assertIn('| Credit Policy Hub ID | `987654321` |', rendered)

    def test_cli_writes_under_generated_and_never_into_skills(self):
        with tempfile.TemporaryDirectory() as directory:
            bindings = Path(directory) / 'defaults.json'
            bindings.write_text('{"boxEnterpriseId": "1", "creditPolicyHubId": "2", "docgenCommitmentLetterTemplateId": "3", "signerEmail": "a@b.co"}')
            output = Path(directory) / 'primer.md'
            self.assertEqual(main(['--bindings', str(bindings), '--section', 'primer', '--output', str(output)]), 0)
            self.assertIn('Credit Policy Hub ID 2;', output.read_text())
            self.assertEqual(main(['--bindings', str(bindings), '--output', str(ROOT / 'skills' / 'x.md')]), 2)
            self.assertFalse((ROOT / 'skills' / 'x.md').exists())
            self.assertEqual(main(['--bindings', str(Path(directory) / 'missing.json')]), 2)
        self.assertTrue(str(GENERATED).endswith('config/runtime/generated'))


if __name__ == '__main__':
    unittest.main()
