"""The borrower checklist has two copies on purpose: the BCL artifact operators import
and the React constant the portal renders. This test is what keeps them one list."""

import importlib.util
import re
import unittest
from pathlib import Path


MODULE_PATH = Path(__file__).parents[1] / "scripts/bcl.py"
SPEC = importlib.util.spec_from_file_location("bcl", MODULE_PATH)
bcl = importlib.util.module_from_spec(SPEC)
assert SPEC.loader
SPEC.loader.exec_module(bcl)

ROOT = Path(__file__).parents[1]
BCL_PATH = ROOT / "config" / "los" / "required-documents.bcl"
TS_PATH = (
    ROOT
    / "los-salesforce-project/force-app/main/default/uiBundles/losreactapp/src/lib/requiredDocuments.ts"
)

LOAN_TYPES = ["Term Loan", "Line of Credit", "Equipment Finance", "Commercial Real Estate", "SBA 7(a)"]
DOCUMENT_TYPES = {
    "Application",
    "Financial Statement",
    "Tax Return",
    "Bank Statement",
    "Appraisal",
    "Term Sheet",
    "Commitment Letter",
    "Loan Agreement",
    "Insurance",
    "Credit Memo",
    "Environmental Report",
}
# The lists the intake contract fixes; both copies must carry exactly these, in this order.
CONTRACT = {
    "Term Loan": ["Application", "Financial Statement", "Tax Return", "Bank Statement"],
    "Line of Credit": ["Application", "Financial Statement", "Bank Statement"],
    "Equipment Finance": ["Application", "Financial Statement", "Tax Return"],
    "Commercial Real Estate": [
        "Application",
        "Financial Statement",
        "Tax Return",
        "Bank Statement",
        "Appraisal",
        "Insurance",
        "Environmental Report",
    ],
    "SBA 7(a)": ["Application", "Financial Statement", "Tax Return", "Bank Statement", "Insurance"],
}


class _TSLiteral:
    """Read one JSON-like TypeScript object literal: quoted or bare keys, single or double
    quoted strings, trailing commas, line and block comments. Nothing more is needed for a
    data constant, and anything more should not be in one."""

    def __init__(self, text: str):
        self.text = text
        self.pos = 0

    def parse(self):
        value = self._value()
        self._skip()
        return value

    def _skip(self):
        while self.pos < len(self.text):
            if self.text.startswith("//", self.pos):
                end = self.text.find("\n", self.pos)
                self.pos = len(self.text) if end == -1 else end + 1
            elif self.text.startswith("/*", self.pos):
                end = self.text.find("*/", self.pos)
                if end == -1:
                    raise ValueError("unterminated block comment")
                self.pos = end + 2
            elif self.text[self.pos] in " \t\r\n":
                self.pos += 1
            else:
                return

    def _value(self):
        self._skip()
        if self.pos >= len(self.text):
            raise ValueError("unexpected end of literal")
        char = self.text[self.pos]
        if char == "{":
            return self._object()
        if char == "[":
            return self._array()
        if char in "\"'`":
            return self._string()
        match = re.match(r"-?\d+(\.\d+)?|true|false|null", self.text[self.pos :])
        if not match:
            raise ValueError(f"unexpected token at {self.pos}: {self.text[self.pos:self.pos + 20]!r}")
        self.pos += match.end()
        token = match.group(0)
        if token in ("true", "false"):
            return token == "true"
        if token == "null":
            return None
        return float(token) if "." in token else int(token)

    def _string(self):
        quote = self.text[self.pos]
        self.pos += 1
        out = []
        while self.pos < len(self.text):
            char = self.text[self.pos]
            if char == "\\":
                out.append(self.text[self.pos + 1])
                self.pos += 2
                continue
            if char == quote:
                self.pos += 1
                return "".join(out)
            out.append(char)
            self.pos += 1
        raise ValueError("unterminated string")

    def _key(self):
        self._skip()
        if self.text[self.pos] in "\"'":
            return self._string()
        match = re.match(r"[A-Za-z_$][A-Za-z0-9_$]*", self.text[self.pos :])
        if not match:
            raise ValueError(f"expected an object key at {self.pos}")
        self.pos += match.end()
        return match.group(0)

    def _object(self):
        self.pos += 1
        result = {}
        while True:
            self._skip()
            if self.text[self.pos] == "}":
                self.pos += 1
                return result
            key = self._key()
            self._skip()
            if self.text[self.pos] != ":":
                raise ValueError(f"expected ':' after key {key!r}")
            self.pos += 1
            result[key] = self._value()
            self._skip()
            if self.text[self.pos] == ",":
                self.pos += 1

    def _array(self):
        self.pos += 1
        result = []
        while True:
            self._skip()
            if self.text[self.pos] == "]":
                self.pos += 1
                return result
            result.append(self._value())
            self._skip()
            if self.text[self.pos] == ",":
                self.pos += 1


def load_react_constant(source: str):
    """Return the REQUIRED_DOCUMENTS literal from the TypeScript module source."""
    match = re.search(r"REQUIRED_DOCUMENTS\b[^=]*=\s*", source)
    if not match:
        raise ValueError("no `REQUIRED_DOCUMENTS = ...` declaration found")
    return _TSLiteral(source[match.end() :]).parse()


def rows(table):
    return {
        loan_type: [(row["documentType"], row["label"], row["why"]) for row in entries]
        for loan_type, entries in table.items()
    }


class RequiredDocumentsBCLTests(unittest.TestCase):
    def setUp(self):
        self.config = bcl.load_bcl(BCL_PATH)

    def test_artifact_identity(self):
        self.assertEqual(self.config["artifact_name"], "required-documents")
        self.assertEqual(self.config["provider_object_id"], "los/required-documents")

    def test_lists_match_the_intake_contract(self):
        requirements = self.config["requirements"]
        self.assertEqual(list(requirements), LOAN_TYPES)
        for loan_type, expected in CONTRACT.items():
            self.assertEqual([row["documentType"] for row in requirements[loan_type]], expected, loan_type)

    def test_every_row_is_a_known_type_with_borrower_facing_text(self):
        for loan_type, entries in self.config["requirements"].items():
            for row in entries:
                self.assertEqual(set(row), {"documentType", "label", "why"}, f"{loan_type}: {row}")
                self.assertIn(row["documentType"], DOCUMENT_TYPES, loan_type)
                self.assertTrue(row["label"].strip(), loan_type)
                # One sentence a borrower can read: ends with a full stop and has no second one.
                self.assertRegex(row["why"], r"^[^.]+\.$", f"{loan_type}: {row['why']!r}")

    def test_react_constant_mirrors_the_bcl(self):
        if not TS_PATH.is_file():
            self.fail(
                f"{TS_PATH.relative_to(ROOT)} does not exist. The React bundle must export "
                "REQUIRED_DOCUMENTS from that file so the portal checklist mirrors "
                "config/los/required-documents.bcl."
            )
        try:
            constant = load_react_constant(TS_PATH.read_text(encoding="utf-8"))
        except ValueError as error:
            self.fail(f"could not read REQUIRED_DOCUMENTS from {TS_PATH.relative_to(ROOT)}: {error}")
        self.assertIsInstance(constant, dict)
        self.assertEqual(list(constant), list(self.config["requirements"]), "loan types differ or are out of order")
        self.assertEqual(
            rows(constant),
            rows(self.config["requirements"]),
            "REQUIRED_DOCUMENTS and config/los/required-documents.bcl disagree; the BCL is the source of truth",
        )


class TSLiteralReaderTests(unittest.TestCase):
    def test_reads_bare_keys_trailing_commas_and_comments(self):
        source = """
        import type { X } from "./x";
        // the checklist
        export const REQUIRED_DOCUMENTS: Record<string, X[]> = {
          "SBA 7(a)": [
            { documentType: 'Application', label: "Loan application", why: "Why.", }, /* note */
          ],
          plain: [],
        } as const;
        """
        self.assertEqual(
            load_react_constant(source),
            {"SBA 7(a)": [{"documentType": "Application", "label": "Loan application", "why": "Why."}], "plain": []},
        )

    def test_missing_declaration_is_named(self):
        with self.assertRaises(ValueError):
            load_react_constant("export const OTHER = {};")


if __name__ == "__main__":
    unittest.main()
