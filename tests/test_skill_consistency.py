"""The four presenter skills tell the same story: same prompts, numbers, signers and Doc Gen paths."""
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).parents[1]
SKILLS = {name: (ROOT / 'skills' / name / 'SKILL.md').read_text() for name in
          ('loan-origination-claude', 'loan-origination-quick', 'loan-origination-slack', 'loan-origination-gemini')}
PROMPTS = [
    "What's the status of Harborview's distribution facility loan? Which documents in that loan are flagged critical policy risk?",
    'Extract loan terms from the marked-up term sheet for that loan and check them against credit policy.',
    'Validate those terms against the Salesforce record.',
    'apply the amount, rate and term to the record, confirm',
    "Compare the covenant terms across Harborview's prior executed loans and this 2026 markup.",
    'Generate the commitment letter for this loan and send it for signature using the confirmed signer.',
]
EVIDENCE = ['4.8M', '6.85%', '6.50%', '120', '1.10x', '70%', '1.30x', 'LOS-LTV-001', 'LOS-DSCR-001',
            'signed by Priya Shah for Acme Bank and Jordan Pike for Harborview']
DOCGEN_PATHS = ['loan.id', 'loan.borrower', 'loan.loanAmount', 'loan.status', 'loan.termSheetReference',
                'terms.policyAtIssue', 'terms.requestedPosition', 'terms.approvedPosition', 'terms.exceptionPosition',
                'terms.owner', 'terms.risk', 'terms.proposedTerms', 'precedent.summary', 'letter.preparedOn', 'letter.preparedBy']


class SkillConsistencyTests(unittest.TestCase):
    def test_every_skill_offers_the_same_six_prompts(self):
        for name, text in SKILLS.items():
            for prompt in PROMPTS:
                self.assertIn(prompt, text, f'{name}: {prompt}')

    def test_every_skill_expects_the_same_evidence(self):
        for name, text in SKILLS.items():
            for item in EVIDENCE:
                self.assertIn(item, text, f'{name}: {item}')

    def test_apply_examples_write_the_bank_rate_not_the_borrower_request(self):
        for name, text in SKILLS.items():
            rates = re.findall(r'"interestRate":\s*([0-9.]+)', text)
            self.assertEqual(set(rates) - {'6.85'}, set(), f'{name}: applyLoanTerms example rates {rates}')

    def test_examples_never_hardcode_the_demo_loan_id(self):
        for name, text in SKILLS.items():
            for block in re.findall(r'```json\n(.*?)\n```', text, re.S):
                self.assertNotIn('LN-2026-0042', block, name)

    def test_docgen_contract_names_all_fifteen_paths(self):
        for name, text in SKILLS.items():
            for path in DOCGEN_PATHS:
                leaf = path.split('.')[1]
                self.assertIn(leaf, text, f'{name}: {path}')

    def test_every_skill_carries_a_revision_line(self):
        for name, text in SKILLS.items():
            self.assertRegex(text, r'(?m)^Skill revision: \d{4}-\d{2}-\d{2} \w+', name)


if __name__ == '__main__':
    unittest.main()
