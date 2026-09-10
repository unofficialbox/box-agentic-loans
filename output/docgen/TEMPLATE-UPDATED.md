# Commitment Letter Template - Box Sign Tags

**Last updated:** 2026-09-09  
**Template:** `los-commitment-letter-template.docx`  
**Backup:** `los-commitment-letter-template.backup.docx`

## What Changed

Added Box Sign tags for embedded signing with `is_document_preparation_needed = false`:

```
[[s:email:signer]]  → Signature field
[[d:email:signer]]  → Date signed field
```

These tags are placed in the signature block at the end of the commitment letter.

## Why Box Sign Tags

When using embedded signing (`is_document_preparation_needed = false`), signature fields must be pre-placed in the document. Box Sign recognizes these tags during sign request creation and converts them to interactive fields.

The signer identifier (`email`) matches the `embed_url_external_user_id` in the sign request, ensuring the correct signer can access each field.

## Template Upload

After generating a commitment letter with Doc Gen:
1. The PDF includes the tags as text: `[[s:email:signer]]`
2. When creating the sign request, Box Sign converts tags to fields
3. The borrower sees interactive signature and date fields in the embedded iframe

## Testing

```bash
# Generate commitment letter (Beat 5)
Generate the commitment letter for LN-2026-0042.

# Prepare sign request (Beat 5b)
Send the Dockwright commitment letter for signature.

# Verify in borrower portal
1. Sign in as Dana Whitfield
2. Open LN-2026-0042 workspace
3. Embedded sign iframe should display
4. Signature and date fields should be interactive
```

## Re-generating Tags

If the template needs to be rebuilt:

```bash
# Restore backup
cp output/docgen/los-commitment-letter-template.backup.docx \
   output/docgen/los-commitment-letter-template.docx

# Re-run script
source .venv/bin/activate
python3 scripts/add_sign_tags.py
```

## References

- **Script:** `scripts/add_sign_tags.py`
- **Documentation:** `docs/BOX-SIGN-TAGS.md`
- **Box Sign Tags:** https://docs.box.com/en/box-sign/templates/creating-templates-using-tags.md
