# Demo Clickpath

Quick reference guide for running the commercial loan origination demo. Six beats across browser and AI harness showing borrower application, AI-powered loan analysis, and automated document generation.

**Full demo guide**: [Public storyboard](https://unofficialbox.github.io/box-agentic-loans/) with screenshots and detailed walkthrough.

---

## Pre-Flight Checklist

Before presenting:
- [ ] Both connectors loaded (Box + LOS) and working
- [ ] Test loans seeded: LN-2023-0311 (Closed), LN-2025-0148 (Closed), latest Harborview loan (Approved)
- [ ] Dana Whitfield borrower account ready and tested
- [ ] Claude Desktop custom instructions set (see below)

### Claude Desktop Custom Instructions

```text
ALWAYS use bullets or tables. Never paragraphs. 60 words or fewer. Lead with the finding. No preamble. No restating my question. Never print IDs. After citing a document, open it inline with get_file_preview. No closing offers.
```

---

## Beat-by-Beat Prompts

### Beat 1: Borrower Applies (Browser)
Open portal: `https://<your-site>.my.site.com/loansvforcesite/login?startURL=%2Floans%2F`

Sign in as Dana Whitfield → Start application → Upload 2 documents → Submit

**Show**: Borrower perspective, Box AI classification, Salesforce record creation

---

### Beat 2: Find Critical Risk Documents (AI)
```
What's the latest loan for Harborview Logistics? Which documents in that loan are flagged critical policy risk?
```

**Expected**: Finds latest loan, metadata search returns term sheet with `policyRisk=Critical`, shows document preview

---

### Beat 3: Extract & Validate Terms (AI)
```
Extract loan terms from the marked-up term sheet for that loan and check them against credit policy.
```

**Follow-up prompts:**
```
Validate those terms against the Salesforce record.
```
```
apply the amount, rate and term to the record, confirm
```

**Expected**: Box AI extraction → policy validation → record comparison → confirmed write to Salesforce

---

### Beat 4: Compare Loan History (AI)
```
Compare the covenant terms across Harborview's prior executed loans and this 2026 markup.
```

**Expected**: Reads LN-2023-0311 and LN-2025-0148 executed agreements, compares guaranty terms

---

### Beat 5: Generate & Send for Signature (AI)
```
Generate the commitment letter for this loan and send it for signature using the confirmed signer.
```

**Expected**: Box Doc Gen creates letter → prepareSignatureRequest returns embed URL → Sign_Embed_URL__c populated

---

### Beat 6: Borrower Signs (Browser)
Return to portal: `https://<your-site>.my.site.com/loansvforcesite/login?startURL=%2Floans%2F`

Sign in as Dana → Open loan workspace → Sign commitment letter in embedded iframe

**Show**: Box Sign embedded signing, document completion

---

## Key Terms

| Term | Definition | Example |
|------|------------|---------|
| **LTV** | Loan-to-Value ratio | 85% LTV = $850K loan on $1M property |
| **DSCR** | Debt Service Coverage Ratio | 1.25x = $1.25 income per $1 debt payment |
| **Term Sheet** | Proposed loan terms before approval | Interest rate, LTV, DSCR, guaranty terms |
| **Commitment Letter** | Bank's formal loan approval offer | Generated via Box Doc Gen |

---

## Troubleshooting

**AI not finding documents?**
- Check metadata: Documents must have `losDocument` template applied
- Verify loan has `Box_Workspace_Folder_ID__c` or FRUP record

**Signature preparation fails?**
- Loan status must be "Approved" or "Commitment"
- Check prepareSignatureRequest response for `iframeable_embed_url`

**Sign iframe not showing in portal?**
- Verify `Sign_Embed_URL__c` is populated on loan record
- Check browser console for API errors

---

## After Demo

Clean up test loans:
```bash
python3 scripts/cleanup_demo.py --status Application --yes
```

---

## Reference

- **[SETUP.md](docs/SETUP.md)** - Initial deployment
- **[CLIENT-SETUP.md](docs/CLIENT-SETUP.md)** - AI harness configuration
- **[PRESENTING.md](docs/PRESENTING.md)** - Delivery tips and 6:30 shortened version
