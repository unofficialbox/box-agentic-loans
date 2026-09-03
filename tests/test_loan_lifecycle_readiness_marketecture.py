import importlib.util
import re
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts" / "build_loan_lifecycle_readiness_marketecture.py"


class LoanLifecycleReadinessMarketectureTest(unittest.TestCase):
    def test_builds_self_contained_accessible_lifecycle_page(self) -> None:
        spec = importlib.util.spec_from_file_location("los_lifecycle_marketecture", SCRIPT)
        module = importlib.util.module_from_spec(spec)
        assert spec.loader
        spec.loader.exec_module(module)

        with tempfile.TemporaryDirectory() as directory:
            module.OUTPUT = Path(directory) / "marketecture.html"
            output = module.build()
            source = output.read_text(encoding="utf-8")

        self.assertIn("AI-Assisted Loan Origination", source)
        self.assertIn("Loan Origination (LOS)", source)
        self.assertIn("One end-to-end lifecycle. Persistent platform responsibilities.", source)
        self.assertEqual(source.count('<article class="stage'), 6)
        self.assertEqual(source.count('class="stage-num"'), 6)
        self.assertEqual(source.count('class="lane '), 2)
        self.assertIn("Human Decision Gate", source)
        self.assertIn("Approved Closing &amp; Servicing", source)
        self.assertIn("Policy &amp; Covenant Analysis", source)
        self.assertIn("Persistent platform responsibilities across every lifecycle stage", source)
        self.assertNotRegex(source, r'(?:src|href)=["\']https?://')
        self.assertEqual(
            set(re.findall(r'data-brand-logo="([^"]+)"', source)),
            {"box", "salesforce"},
        )
        self.assertIn("@media (max-width:1000px)", source)
        self.assertNotIn("Systems of record below", source)
        self.assertIn('<body class="compact">', source)
        self.assertIn('data-view="compact" aria-pressed="true">Overview</button>', source)
        self.assertIn('data-view="detail" aria-pressed="false">Detail</button>', source)
        self.assertLess(source.index(">Overview</button>"), source.index(">Detail</button>"))
        self.assertEqual(source.count('class="technical-note stage-detail"'), 6)
        self.assertIn("body:not(.compact) .technical-note", source)
        self.assertNotIn("body.compact .stage p", source)
        self.assertNotIn("body.compact .lane-head p", source)
        self.assertNotIn("body.compact .lane-cell span", source)
        self.assertNotIn("body.compact .outcomes p", source)
        self.assertEqual(source.count('class="technical-note lane-technical"'), 2)
        self.assertIn("Standard Salesforce REST upserts", source)
        self.assertIn("Box content and Salesforce context", source)
        self.assertIn("border-left:5px solid var(--box)", source)
        self.assertIn("grid-template-columns:270px repeat(6,1fr)", source)
        self.assertIn("border-left:2px dotted var(--lane-color)", source)
        self.assertIn("grid-template-columns:1.1fr repeat(4,1fr)", source)
        self.assertIn("radial-gradient(circle at 90% 5%", source)
        for brand_color in ("#00a1e0", "#0061d5"):
            self.assertIn(brand_color, source)


if __name__ == "__main__":
    unittest.main()
