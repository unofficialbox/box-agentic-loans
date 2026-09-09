# Box Sign Template Tags

When using embedded signing with `is_document_preparation_needed = false`, signature fields must be pre-placed in the document using Box Sign tags.

## Required Template Updates

The commitment letter template (`output/docgen/los-commitment-letter-template.docx`) must include Box Sign tags where the borrower should sign.

### Tag Format

Box Sign tags follow this pattern:
```
[[tag_type:signer_identifier:role_name]]
```

For the commitment letter (single signer: borrower):
- **Signature:** `[[s:email:signer]]`
- **Date:** `[[d:email:signer]]`
- **Text input:** `[[t:email:signer:Label]]`
- **Checkbox:** `[[c:email:signer:Label]]`

### Where to Add Tags

Add these tags at the end of the commitment letter template, in the signature block:

```
_________________________________
Borrower Signature [[s:email:signer]]

Date: [[d:email:signer]]


_________________________________
Harborview Logistics Holdings LLC
```

### How Tags Work

1. **Doc Gen** generates the PDF with tags as text
2. **Box Sign** recognizes the tags when creating the sign request
3. Tags are converted to interactive signature fields automatically
4. The signer identifier (`email`) matches the `embed_url_external_user_id` in the sign request

### Tag Reference

| Tag | Purpose | Example |
|-----|---------|---------|
| `[[s:email:signer]]` | Signature field | Clickable signature box |
| `[[d:email:signer]]` | Date signed | Auto-filled when signed |
| `[[t:email:signer:Title]]` | Text input | Borrower can type "Title" |
| `[[c:email:signer:Agree]]` | Checkbox | Checkbox labeled "Agree" |

### Sign Request Configuration

The `LosSendForSignature` class configures the sign request for embedded signing:

```apex
Map<String, Object> signer = new Map<String, Object>{
    'email' => req.signerEmail.trim(),
    'role' => 'signer',
    'embed_url_external_user_id' => req.signerEmail.trim()  // Matches tag identifier
};

// ...

'is_document_preparation_needed' => false,  // Use pre-placed tags
```

### Testing

1. Update the Word template with tags
2. Upload to Box as the commitment letter template (ID: `2454763922014`)
3. Generate a commitment letter via Doc Gen
4. Verify the generated PDF shows the tags as text
5. Create a sign request via `prepareSignatureRequest`
6. Open the embed URL - tags should appear as interactive fields

### References

- [Box Sign Template Tags Documentation](https://docs.box.com/en/box-sign/templates/creating-templates-using-tags.md)
- [Box Sign Embedded Signing](https://developer.box.com/guides/box-sign/embedded-sign-client.md)
- [Sign Request API](https://developer.box.com/reference/post-sign-requests.md)
