"""The presenter payload must cover the actual commitment template's merge paths."""
import json
from pathlib import Path
import re
import unittest
import xml.etree.ElementTree as ET
import zipfile

ROOT = Path(__file__).resolve().parents[1]


class DocGenContractTests(unittest.TestCase):
    def test_mcp_example_covers_every_template_merge_path(self):
        guide = (ROOT / 'skills/loan-origination/SKILL.md').read_text().split('### Complete merge payload', 1)[1]
        payload = json.loads(re.search(r'```json\n(.*?)\n```', guide, re.S).group(1))
        self.assertEqual(set(payload), {'file_id', 'destination_folder_id', 'output_type', 'document_generation_data'})
        self.assertEqual(payload['output_type'], 'pdf')
        entry, = payload['document_generation_data']
        self.assertEqual(set(entry), {'generated_file_name', 'user_input'})

        def paths(value, prefix=''):
            result = set()
            for key, child in value.items():
                name = f'{prefix}.{key}' if prefix else key
                result.update(paths(child, name) if isinstance(child, dict) else {name})
            return result

        with zipfile.ZipFile(ROOT / 'output/docgen/los-commitment-letter-template.docx') as doc:
            text = '\n'.join(
                ''.join(ET.fromstring(doc.read(name)).itertext())
                for name in doc.namelist() if name.startswith('word/') and name.endswith('.xml')
            )
        tags = set(re.findall(r'\{\{([^{}]+)\}\}', text))
        self.assertTrue(tags, 'The test must inspect a template with merge tags')
        self.assertEqual(paths(entry['user_input']), tags)


if __name__ == '__main__':
    unittest.main()
