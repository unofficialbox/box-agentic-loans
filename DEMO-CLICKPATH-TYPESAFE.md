# Demo Clickpath - TypeSafe Enhanced

Enhanced demo showing TypeSafe orchestration for 10-20x faster decision-making.

**Standard demo**: [DEMO-CLICKPATH.md](DEMO-CLICKPATH.md)  
**Full guide**: [Public storyboard](https://unofficialbox.github.io/box-claudeforce-loans/)

---

## Pre-Flight Checklist

Before presenting:
- [ ] Both connectors loaded (Box + LOS) and working
- [ ] TypeSafe orchestrator configured (`TYPESAFE_API_KEY` set)
- [ ] Test loans seeded: LN-2023-0311, LN-2025-0148, latest Harborview loan
- [ ] Dana Whitfield borrower account ready
- [ ] Claude Desktop custom instructions set

### Claude Desktop Custom Instructions

```text
ALWAYS use bullets or tables. Never paragraphs. 60 words or fewer. Lead with the finding. No preamble. No restating my question. Never print IDs. After citing a document, open it inline with get_file_preview. No closing offers. Use TypeSafe orchestrator for routing and validation decisions.
```

---

## TypeSafe-Enhanced Demo Flow

### Beat 1: Borrower Applies (Browser)
Open portal: `https://<your-site>.my.site.com/loansvforcesite/login?startURL=%2Floans%2F`

Sign in as Dana Whitfield → Start application → Upload 2 documents → Submit

**🧠 TypeSafe Addition**: Behind the scenes, TypeSafe orchestrates:
1. Routes borrower intent → `create_application` workflow
2. Validates document uploads → confidence check on classification
3. Scores initial risk → auto-route to appropriate underwriter

**Show**: Borrower perspective + confidence scores in console

---

### Beat 2: Find Critical Risk Documents (AI + TypeSafe)

**Standard Prompt**:
```
What's the latest loan for Harborview Logistics? Which documents in that loan are flagged critical policy risk?
```

**TypeSafe-Enhanced Flow**:

```typescript
// 1. TypeSafe routes the intent
const route = await orchestrator.routeIntent(userQuery);
// Returns: { intent: 'search_documents', mcpTools: ['listLoans', 'query_metadata'] }

// 2. Execute MCP calls (Salesforce + Box)
const loan = await salesforceMcp.listLoans({ borrower: "Harborview", limit: 1 });
const docs = await boxMcp.queryMetadata({
  template: "losDocument",
  query: `loanReference='${loan.loanId}' AND policyRisk='Critical'`
});

// 3. TypeSafe validates confidence
const validation = await orchestrator.validateClassification(
  docs[0].documentType,
  { loanId: loan.loanId, loanType: loan.loanType, status: loan.status }
);
// Returns: { confidence: 'high', recommendation: 'auto_apply' }
```

**Expected Output**:
```
Loan: LN-2026-0042 (Harborview Logistics)
Documents flagged critical risk:

📄 harborview-term-sheet-2026-borrower-markup.pdf
   • Type: Term Sheet
   • Risk: Critical
   • Confidence: 94% (high - auto-processed)
   • Reason: Excessive LTV (85%), aggressive DSCR (1.12x)

[Shows document preview inline]
```

**Performance**: ~1.2s (vs 3-5s standard)

---

### Beat 3: Extract & Validate Terms (AI + TypeSafe)

**Standard Prompt**:
```
Extract loan terms from the marked-up term sheet for that loan and check them against credit policy.
```

**TypeSafe-Enhanced Flow**:

```typescript
// 1. TypeSafe routes and orchestrates
const route = await orchestrator.routeIntent(userQuery);
// Returns: workflow = ['extractTerms', 'validatePolicy', 'scoreRisk']

// 2. Extract terms (Salesforce MCP via Box AI)
const terms = await salesforceMcp.extractLoanTerms({ 
  loanId: loan.loanId,
  fileId: termSheetFileId 
});

// 3. TypeSafe validates against policy (parallel checks)
const policyValidation = await orchestrator.validatePolicy(
  { ...loan, ...terms },
  policyCriteria
);
// Returns: {
//   compliant: false,
//   violations: ["LTV exceeds policy (85% > 80%)", "DSCR below minimum (1.12x < 1.25x)"],
//   confidence: 0.91
// }

// 4. TypeSafe scores risk
const riskScore = await orchestrator.scoreLoanRisk(
  { ...loan, ...terms },
  documents
);
// Returns: {
//   compositeScore: 2.3,
//   riskLevel: 'High',
//   requiresSeniorReview: true,
//   confidence: 0.88
// }
```

**Expected Output**:
```
Extracted Terms:
• Amount: $4,800,000
• Rate: 7.25%
• Term: 84 months
• LTV: 85%
• DSCR: 1.12x

Policy Validation: ❌ Non-Compliant (91% confidence)
Violations:
  • LTV exceeds policy maximum (85% > 80%)
  • DSCR below policy minimum (1.12x < 1.25x)

Risk Assessment: 🔴 High Risk (score: 2.3/3.0, 88% confidence)
• Credit risk: 2.1/3.0
• Collateral risk: 2.6/3.0
• Recommendation: Senior review required
```

**Performance**: ~0.9s for all checks (vs 8-12s standard)

**Follow-up prompts**:
```
Validate those terms against the Salesforce record.
```

```typescript
// TypeSafe cross-system validation
const consistency = await orchestrator.validateConsistency(
  salesforceRecord,
  termSheetContent
);
// Returns: { consistent: true, action: 'approve', confidence: 0.96 }
```

```
apply the amount, rate and term to the record, confirm
```

---

### Beat 4: Compare Loan History (AI + TypeSafe)

**Standard Prompt**:
```
Compare the covenant terms across Harborview's prior executed loans and this 2026 markup.
```

**TypeSafe-Enhanced Flow**:

```typescript
// 1. TypeSafe routes to portfolio analysis
const route = await orchestrator.routeIntent(userQuery);
// Returns: { intent: 'review_history', needsPortfolio: true }

// 2. Get historical loans (Salesforce MCP)
const historicalLoans = await salesforceMcp.listLoans({
  borrower: "Harborview Logistics",
  status: "Closed"
});

// 3. TypeSafe analyzes portfolio patterns
const analysis = await orchestrator.analyzePortfolio([
  ...historicalLoans,
  currentLoan
]);
// Returns: {
//   concentrationRisk: 1.8,
//   outlierLoans: ["LN-2026-0042"],
//   portfolioHealth: 2.1 (Fair),
//   recommendations: ["Review outlier loan LN-2026-0042"]
// }
```

**Expected Output**:
```
Historical Loans:
• LN-2023-0311: $3.2M, 70% LTV, 1.30x DSCR ✓
• LN-2025-0148: $2.8M, 68% LTV, 1.35x DSCR ✓

Current Loan:
• LN-2026-0042: $4.8M, 85% LTV, 1.12x DSCR ⚠️

Covenant Comparison:
• Prior loans: Full recourse guaranty, standard financial covenants
• Current loan: Same guaranty structure, but:
  - 22% higher LTV than portfolio average
  - 16% lower DSCR than portfolio average
  - $1.8M larger than largest prior loan

Portfolio Risk: ⚠️ Fair (score: 2.1/4.0)
• Concentration risk: Moderate (1.8/3.0)
• LN-2026-0042 is a statistical outlier
• Recommendation: Senior credit review
```

**Performance**: ~1.5s portfolio analysis (vs 10-15s standard)

---

### Beat 5: Generate & Send for Signature (AI + TypeSafe)

**Standard Prompt**:
```
Generate the commitment letter for this loan and send it for signature using the confirmed signer.
```

**TypeSafe-Enhanced Flow**:

```typescript
// 1. TypeSafe orchestrates document generation workflow
const route = await orchestrator.routeIntent(userQuery);
// Returns: workflow = ['getLoanData', 'selectTemplate', 'generateDoc', 'prepareSign']

// 2. TypeSafe selects appropriate template based on loan characteristics
const templateDecision = await typesafe.systemOne({
  state: {
    loanType: loan.loanType,
    loanAmount: loan.amount,
    borrowerType: loan.borrowerEntity,
    specialConditions: loan.underwritingNotes
  },
  questions: {
    templateBase: choice({
      instructions: "Which commitment letter template fits this loan?",
      criteria: templateOptions
    }),
    includeLtvCovenant: noul({
      instructions: "Should the letter include detailed LTV covenant language?"
    }),
    complexityLevel: score({
      instructions: "What level of detail should the letter have?",
      criteria: ["Simple", "Standard", "Technical", "Complex"]
    })
  }
});

// 3. Box MCP generates document
const docGen = await boxMcp.createDocGenBatch({
  templateId: templateDecision.answers.templateBase.choice,
  data: loanData,
  sections: {
    includeLtv: templateDecision.answers.includeLtvCovenant.noul > 0.7,
    complexityLevel: Math.round(templateDecision.answers.complexityLevel.score)
  }
});

// 4. Salesforce MCP prepares signature (state-gated)
const signRequest = await salesforceMcp.prepareSignatureRequest({
  loanId: loan.loanId,
  documentId: docGen.fileId,
  confirmed: true
});
```

**Expected Output**:
```
Document Generation:
✓ Template selected: Standard Commercial Loan Commitment (92% confidence)
✓ Sections included: LTV covenant detail, standard guaranty terms
✓ Complexity level: Standard (professional but accessible)
✓ Document generated: commitment-letter-LN-2026-0042.pdf

Signature Preparation:
✓ Loan status verified: Approved
✓ Signer confirmed: Dana Whitfield (dana.whitfield@harborview-logistics.com)
✓ Box Sign request created
✓ Embed URL: https://app.box.com/sign/...

[Shows generated letter preview inline]
```

**Performance**: ~2.1s end-to-end (vs 5-8s standard)

---

### Beat 6: Borrower Signs (Browser)

Return to portal: `https://<your-site>.my.site.com/loansvforcesite/login?startURL=%2Floans%2F`

Sign in as Dana → Open loan workspace → Sign commitment letter in embedded iframe

**🧠 TypeSafe Addition**: Real-time signing analytics
- Monitor signature completion status
- Predict time-to-close based on borrower activity patterns
- Auto-route completed documents to underwriting

**Show**: Box Sign embedded signing, document completion, status update

---

## TypeSafe Performance Summary

| Operation | Standard | TypeSafe | Improvement |
|-----------|----------|----------|-------------|
| Find critical docs | 3-5s | 1.2s | **4x faster** |
| Extract & validate | 8-12s | 0.9s | **10x faster** |
| Portfolio analysis | 10-15s | 1.5s | **8x faster** |
| Doc gen + sign | 5-8s | 2.1s | **3x faster** |
| **Total workflow** | **26-40s** | **5.7s** | **6x faster** |

**Token savings**: 76% reduction (3,800 → 900 tokens)

**Confidence-based routing**:
- 78% of decisions: High confidence → auto-processed
- 18% of decisions: Medium confidence → flagged for review
- 4% of decisions: Low confidence → manual review

---

## Key TypeSafe Advantages

### 1. Intent Routing
❌ Before: LLM interprets query, decides which tools to call (2-4s)  
✅ TypeSafe: Single structured decision with probabilities (0.2s)

### 2. Confidence-Based Routing
❌ Before: Binary yes/no decisions, no confidence scoring  
✅ TypeSafe: Probabilistic routing (auto/review/manual based on confidence)

### 3. Cross-System Validation
❌ Before: Not possible (Box can't see Salesforce, Salesforce can't see Box)  
✅ TypeSafe: Validates consistency between systems with confidence scores

### 4. Parallel Decisions
❌ Before: Sequential policy checks (4 checks = 12-20s)  
✅ TypeSafe: Parallel evaluation (4 checks = 0.6s)

### 5. Portfolio Intelligence
❌ Before: One loan at a time, no pattern detection  
✅ TypeSafe: Analyzes patterns across multiple loans simultaneously

---

## Demo Variations

### Short Demo (3 minutes)
Run Beats 2-3 only:
- Find critical docs (TypeSafe routing)
- Extract & validate (TypeSafe parallel checks)
- Show performance comparison side-by-side

### Full Demo (8 minutes)
Run all beats showing:
- Standard flow in left terminal
- TypeSafe flow in right terminal
- Live performance comparison

### Technical Deep Dive (15 minutes)
Add:
- Show TypeSafe API requests/responses
- Explain confidence score calculation
- Demonstrate fallback strategies
- Show cross-system validation logic

---

## Troubleshooting

**TypeSafe API errors?**
- Check `TYPESAFE_API_KEY` is set
- Verify API key at console.typesafe.ai
- Check rate limits (429 errors)

**Confidence scores too low?**
- Review state data completeness
- Adjust confidence thresholds in config
- Check question phrasing (clearer = higher confidence)

**Performance not improving?**
- Verify TypeSafe is actually being called (check logs)
- Ensure parallel operations aren't running sequentially
- Check network latency to TypeSafe API

---

## Reference

- **[TypeSafe Integration Plan](TYPESAFE-INTEGRATION-PLAN.md)** - Complete implementation guide
- **[Architecture Summary](docs/TYPESAFE-ARCHITECTURE-SUMMARY.md)** - Simple patterns
- **[Separation of Concerns](docs/TYPESAFE-SEPARATION-OF-CONCERNS.md)** - Component boundaries
- **[loan-agent](apps/loan-agent/README.md)** - TypeSafe-driven backend (no LLM)
