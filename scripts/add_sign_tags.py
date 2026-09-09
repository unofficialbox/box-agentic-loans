#!/usr/bin/env python3
"""
Add Box Sign tags to the commitment letter template.

Box Sign tags allow pre-placement of signature fields when using
is_document_preparation_needed=false for embedded signing.

Tags format:
- [[s:email:signer]] = Signature field
- [[d:email:signer]] = Date signed

See: https://docs.box.com/en/box-sign/templates/creating-templates-using-tags.md
"""

from docx import Document
from docx.shared import Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
import sys
from pathlib import Path

def add_sign_tags_to_template(template_path: str, output_path: str = None):
    """Add Box Sign tags to commitment letter template."""
    if output_path is None:
        output_path = template_path

    print(f"Loading template: {template_path}")
    doc = Document(template_path)

    # Find the last paragraph (or add one if needed)
    if not doc.paragraphs:
        print("Error: Template has no paragraphs")
        return False

    # Add signature block at the end
    print("Adding signature block with Box Sign tags...")

    # Add some space
    doc.add_paragraph()

    # Signature line with tag
    sig_para = doc.add_paragraph()
    sig_para.add_run("_" * 50)
    sig_para.add_run("\nBorrower Signature ")

    # Add the Box Sign tag for signature
    sig_tag = sig_para.add_run("[[s:email:signer]]")
    sig_tag.font.color.rgb = RGBColor(0, 102, 204)  # Blue to make it visible
    sig_tag.font.size = Pt(10)

    doc.add_paragraph()

    # Date line with tag
    date_para = doc.add_paragraph()
    date_para.add_run("Date: ")

    # Add the Box Sign tag for date
    date_tag = date_para.add_run("[[d:email:signer]]")
    date_tag.font.color.rgb = RGBColor(0, 102, 204)  # Blue
    date_tag.font.size = Pt(10)

    doc.add_paragraph()
    doc.add_paragraph()

    # Entity name line
    entity_para = doc.add_paragraph()
    entity_para.add_run("_" * 50)
    entity_para.add_run("\n{{loan.borrowerEntity}}")

    print(f"Saving updated template: {output_path}")
    doc.save(output_path)

    print("\n✓ Box Sign tags added successfully")
    print("\nTags added:")
    print("  [[s:email:signer]] - Signature field")
    print("  [[d:email:signer]] - Date signed field")
    print("\nNext steps:")
    print("  1. Upload this template to Box")
    print("  2. Update template ID in LOS_Box_Config__c if needed")
    print("  3. Test by generating a commitment letter")

    return True

if __name__ == "__main__":
    template_path = "output/docgen/los-commitment-letter-template.docx"

    if len(sys.argv) > 1:
        template_path = sys.argv[1]

    template_file = Path(template_path)
    if not template_file.exists():
        print(f"Error: Template not found at {template_path}")
        sys.exit(1)

    # Create backup
    backup_path = template_file.with_suffix('.backup.docx')
    print(f"Creating backup: {backup_path}")
    import shutil
    shutil.copy2(template_file, backup_path)

    success = add_sign_tags_to_template(str(template_file))
    sys.exit(0 if success else 1)
