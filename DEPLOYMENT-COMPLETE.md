# Deployment Complete ✅

**Date:** 2026-09-08  
**Org:** agentforce (Hyperforce)  
**Enterprise:** 1023254676 (slack-cfs-demo-ent1)

---

## Environment Summary

### Salesforce Org
- **Org ID:** 00Dfn00000FPAx2EAH
- **My Domain:** https://agentforce-box.my.salesforce.com
- **Metadata Deployed:** ✅ All objects, Apex classes, UI Bundle, Experience Cloud site, MCP server

### Box Integration
- **Enterprise ID:** 1023254676
- **Box User ID:** 27583878577 (slack-cfs-demo-user+ent1-kadams@boxdemo.com)
- **CCG App:** Configured with client credentials
- **Service Account:** Configured and has access to all workspace folders

### LOS Box Configuration
```
Box_User_Id__c: 27583878577
Enterprise_Id__c: 1023254676
Allowed_Folder_Ids__c: 416352496139,416380062104,416383268715,416381677501
Loans_Root_Folder_Id__c: 416352496139
Commitment_Letter_Template_ID__c: 2454763922014
Credit_Policy_Hub_Id__c: 1488378748
```

---

## Loan Portfolio (4 loans)

### Dockwright Logistics Portfolio (3 loans)

**LN-2023-0311** - Harbor Expansion Loan  
- Status: **Closed**
- Amount: $1,500,000 @ 7.25%
- Box Folder: 416383268715
- Documents: ✅ 1 executed loan agreement with metadata

**LN-2025-0148** - Equipment Finance Loan  
- Status: **Closed**
- Amount: $2,150,000 @ 6.95%
- Box Folder: 416381677501
- Documents: ✅ 1 executed loan agreement with metadata

**LN-2026-0042** - Distribution Facility Loan ⭐ Main Demo  
- Status: **Underwriting**
- Amount: $4,800,000 @ 6.85%
- Box Folder: 416352496139 (primary workspace)
- Documents: ✅ 6 documents with full metadata
  - dockwright-loan-application-2026.pdf (Application, Medium)
  - dockwright-term-sheet-2026-borrower-markup.pdf (Term Sheet, **Critical**)
  - dockwright-financial-statements-fy2025.pdf (Financial Statement, High)
  - dockwright-tax-return-summary-2025.pdf (Tax Return, Low)
  - dockwright-appraisal-2026.pdf (Appraisal, High)
  - dockwright-insurance-certificate.pdf (Insurance, Low)

### Other Borrowers

**LN-2026-0088** - Pinecrest Dental Group  
- Status: **Application**
- Amount: $650,000 @ 8.1%
- Box Folder: Not yet provisioned

---

## MCP Server Configuration

### LOS Loan Tools Server
- **Server URL:** https://api.salesforce.com/platform/mcp/v1/custom/LOSLoanTools
- **Status:** ✅ Deployed and Active
- **External Client App:** LOS_Claude_MCP (0xIfn0000004PFxEAM)
- **Permission Set:** LOS_MCP_Client (assigned to kadams@agentforcebox.com)

**Available Tools (6):**
1. `listLoans` - List all loans or filter by borrower/status
2. `getLoanPackage` - Get loan details and Box document listing
3. `extractLoanTerms` - Extract and validate loan terms from documents
4. `applyLoanTerms` - Write extracted terms to loan record (requires confirmation)
5. `classifyDocument` - Classify uploaded document with Box AI
6. `prepareSignatureRequest` - Prepare documents for Box Sign

**Removed Tools (Use Box MCP Instead):**
- ~~`findDocumentsByRisk`~~ → Box MCP `query_metadata`
- ~~`askLoanDocument`~~ → Box MCP `box_ai_ask`
- ~~`generateCommitmentLetter`~~ → Box MCP `create_document_from_template`

### Box MCP Connector
- **Required:** Yes (for Beat 2 metadata search, Box AI, Doc Gen)
- **Status:** User-configured
- **Tools Used:** Folder/metadata search, Box AI extract, Box AI QA, Doc Gen

---

## Demo Beats - Test Results ✅

All beats tested and working in Claude Desktop with both connectors loaded.

### Beat 1: Document Discovery (Salesforce Copilot OR Claude Desktop)
**Prompt:** `What documents do we have for LN-2026-0042?`  
**Expected:** Lists 6 documents with Box file IDs  
**Status:** ✅ Working

### Beat 2: Metadata Search (Claude Desktop - Box connector)
**Prompt:** `Which loan documents are flagged critical policy risk?`  
**Expected:** Returns term sheet (policyRisk=Critical)  
**Status:** ✅ Working

### Beat 3: Extract & Validate (Salesforce Copilot OR Claude Desktop)
**Prompt:** `Extract the loan terms from the marked-up term sheet and tell me if they comply with our credit policy.`  
**Expected:** Extracts terms, validates, flags high LTV  
**Status:** ✅ Working

### Beat 4: Portfolio Search (Claude Desktop - LOS connector)
**Prompt:** `What closed loans does Dockwright Logistics have with us?`  
**Expected:** Returns LN-2023-0311 and LN-2025-0148  
**Status:** ✅ Working

### Beat 5: Generate Letter (Salesforce Copilot OR Claude Desktop)
**Prompt:** `Generate the commitment letter for this loan.`  
**Expected:** Refuses (loan in Underwriting, not Approved)  
**Status:** ✅ Working (proper refusal)

---

## Agentforce Copilot

### LOS Loan Copilot
- **Agent ID:** 0Xxfn0000008EYrCAM
- **Status:** ✅ Published and Activated
- **Agent User:** Configured
- **Permission Set:** LOS_Loan_Agent (assigned)
- **Available Actions:**
  - get_loan_package
  - ask_box_ai
  - extract_loan_terms
- **Test:** Open loan record LN-2026-0042, use Copilot panel

---

## Scripts & Utilities

### Bootstrap
```bash
python3 scripts/demo_operator.py bootstrap --scenario box-salesforce-los --yes
```

### Add Demo Instance
```bash
./scripts/add-demo-instance.sh <alias> <box-folder-id> <loan-id>
```

### Status Check
```bash
python3 scripts/demo_operator.py status --scenario box-salesforce-los
```

### Populate Closed Loans
```bash
./scripts/populate-closed-loans.sh
```

---

## Multi-Instance Support

✅ **Enabled** - Multiple workspace folders can be added to `Allowed_Folder_Ids__c`

**Current Workspaces:**
- 416352496139 - Primary demo workspace (LN-2026-0042)
- 416380062104 - Additional workspace
- 416383268715 - LN-2023-0311 workspace
- 416381677501 - LN-2025-0148 workspace

See `docs/MULTI-INSTANCE.md` for details on creating additional instances.

---

## Access & Permissions

### Salesforce Users
- **Admin:** kadams@agentforcebox.com
  - LOS_Demo_Operator ✅
  - LOS_MCP_Client ✅
  - LOS_Loan_Agent ✅
  - Box managed permission sets ✅

### Box Collaborators
- Service account has access to all loan folders
- User 27583878577 is workspace owner/operator

---

## Known Limitations

1. **Portfolio Search Scope:** Box MCP `query_metadata` searches enterprise-wide by default. Can be scoped to specific folders if needed.

2. **Box for Salesforce Package:** Required for `getLoanPackage` to use `box.Toolkit()`. Service account must be collaborated on folders.

3. **React Multi-Framework:** Required for UI Bundle deployment (Hyperforce orgs only).

4. **Closed Loan Documents:** Minimal (1 executed agreement each). Main demo loan LN-2026-0042 has full document set.

---

## Next Steps

### For Demo
1. Open Claude Desktop
2. Verify both connectors loaded (LOS Loan Tools + Box)
3. Test all 5 beats with prompts from `DEMO-CLICKPATH.md`
4. OR test Salesforce Copilot (Beats 1, 3, 5) in the org

### For Additional Presenters
- Create new Box workspace (copy LOS-2026-Dockwright folder)
- Run `./scripts/add-demo-instance.sh` to link to a loan
- OR use separate Salesforce orgs per presenter

### Maintenance
- Run `python3 scripts/validate_los.py --presenter-ready` before demos
- Check `DEMO-CLICKPATH.md` preflight checklist
- Reconnect MCP connectors after config changes

---

## Support & Documentation

- **Setup Guide:** `docs/SETUP.md`
- **Architecture:** `docs/ARCHITECTURE.md`
- **Demo Script:** `DEMO-CLICKPATH.md`
- **Multi-Instance:** `docs/MULTI-INSTANCE.md`
- **Presenting:** `docs/PRESENTING.md`

**Issues:** https://github.com/anthropics/claude-code/issues

---

**Deployment completed successfully! 🎉**

All core functionality tested and working. The demo is ready for presentation.
