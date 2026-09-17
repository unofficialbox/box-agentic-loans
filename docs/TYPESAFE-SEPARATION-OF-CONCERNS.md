# TypeSafe Separation of Concerns

Clear boundaries between TypeSafe orchestration and MCP data operations.

## Core Principle

**Simple separation of responsibilities:**

- **📄 Unstructured data → Box MCP**: Documents, content, files, AI extraction
- **📊 Structured data → Salesforce MCP**: Records, fields, relationships, governance
- **🧠 Orchestration & decisions → TypeSafe**: Routing, validation, scoring, workflows

**TypeSafe NEVER touches Box or Salesforce APIs directly.** It only makes decisions about data provided by MCPs.

---

## The Rule

```
If it's bytes/content/documents     → Box handles it
If it's records/fields/database     → Salesforce handles it
If it's "which/when/how confident"  → TypeSafe handles it
```

---

## Component Responsibilities

### Box MCP (Data Operations)
✅ Extract document content  
✅ Classify documents with Box AI  
✅ Query metadata  
✅ Generate documents (DocGen)  
✅ Prepare sign requests  
✅ Get file previews  
✅ Box AI QA on content  

❌ Decide if classification is confident enough  
❌ Validate classification in loan context  
❌ Route based on confidence scores  
❌ Orchestrate multi-step workflows  

### Salesforce MCP (Data Operations)
✅ List loans (SOQL)  
✅ Get loan packages  
✅ Extract loan terms with Box AI  
✅ Apply loan terms (with confirmation)  
✅ Prepare signature requests  
✅ Classify documents  

❌ Decide which loans need review  
❌ Score loan risk  
❌ Validate policy compliance  
❌ Route based on risk levels  
❌ Compare across loan portfolio  

### TypeSafe (Decision Operations)
✅ Route user intent → which MCP(s) to call  
✅ Validate MCP results (confidence, context)  
✅ Score risk across multiple dimensions  
✅ Validate policy compliance with probabilities  
✅ Detect anomalies across systems  
✅ Orchestrate multi-step workflows  
✅ Make confidence-based routing decisions  
✅ Compare patterns across loans/documents  

❌ Extract document content  
❌ Query Box metadata  
❌ Query Salesforce records  
❌ Apply metadata to files  
❌ Update Salesforce records  
❌ Generate documents  
❌ Create sign requests  

---

## Example Workflows

### Document Classification

```
┌─────────────────────────────────────────────────────────────┐
│ 1. User uploads document to borrower portal                  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. Box MCP: extract_structured(file_id)                      │
│    → Returns: "documentType": "Term Sheet"                   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. TypeSafe: validate_classification()                       │
│    Input: Box's "Term Sheet" + loan context                 │
│    Questions:                                                │
│      - Classification confidence (Score)                     │
│      - Contextually appropriate? (Noul)                      │
│      - Duplicate risk? (Noul)                                │
│    → Returns: "High confidence, auto-apply"                  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ 4. Salesforce MCP: classifyDocument(file_id, "Term Sheet")  │
│    → Applies metadata to Box file                            │
└─────────────────────────────────────────────────────────────┘
```

**Box does**: Content extraction (its strength)  
**TypeSafe does**: Confidence validation and routing decision (its strength)  
**Salesforce does**: Metadata application through governed Apex (its strength)  

### Cross-System Validation

```
┌─────────────────────────────────────────────────────────────┐
│ 1. Loan officer asks: "Is this loan ready to close?"        │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. TypeSafe: route_intent()                                  │
│    → Decision: Need cross-system validation                  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. Fetch data from both MCPs in parallel:                   │
│    • Salesforce MCP: getLoanPackage(loan_id)                │
│      → Record fields: amount, rate, LTV, term               │
│    • Box MCP: get_file(term_sheet_id)                       │
│      → Document content                                      │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ 4. TypeSafe: validate_consistency()                          │
│    Input: SF record + Box document content                   │
│    Questions:                                                │
│      - Amount matches? (Noul)                                │
│      - Rate matches? (Noul)                                  │
│      - LTV matches? (Noul)                                   │
│      - Overall consistency? (Noul)                           │
│      - Discrepancy severity? (Score)                         │
│    → Returns: "Critical mismatch - block closing"            │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ 5. Report to user with specific discrepancies                │
└─────────────────────────────────────────────────────────────┘
```

**Neither Box nor Salesforce can validate against the other**  
**TypeSafe receives data from both and makes consistency judgment**  

### Intent Routing

```
┌─────────────────────────────────────────────────────────────┐
│ 1. User query: "What's the risk profile for Harborview?"    │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. TypeSafe: route_intent()                                  │
│    Questions:                                                │
│      - Primary intent (Choice):                              │
│          • search_documents                                  │
│          • extract_terms                                     │
│          • validate_policy                                   │
│          • score_risk ← SELECTED                             │
│          • generate_letter                                   │
│      - Needs historical comparison? (Noul)                   │
│      - Needs portfolio context? (Noul)                       │
│    → Returns:                                                │
│        1. Call Salesforce MCP: listLoans(borrower)          │
│        2. Call Box MCP: get documents for each loan         │
│        3. Score risk with TypeSafe                          │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. Execute TypeSafe's orchestration plan:                    │
│    • Salesforce MCP: listLoans("Harborview Logistics")      │
│    • Box MCP: query_metadata for each loan's docs           │
│    • TypeSafe: score_risk() across portfolio                │
│    • Return: Risk analysis with confidence scores           │
└─────────────────────────────────────────────────────────────┘
```

**TypeSafe decides the workflow, MCPs execute the data operations**

---

## API Boundaries

### TypeSafe Methods (Orchestration)

```typescript
class TypeSafeOrchestrator {
  async validateClassification(
    boxResult: string,         // From Box MCP (unstructured → structured)
    loanContext: LoanContext   // From Salesforce MCP (structured data)
  ): Promise<ValidationDecision> {
    /**
     * Input: Data from MCPs
     * Output: Routing decision (auto/review/manual)
     * Does NOT: Call Box or Salesforce APIs
     */
  }
  
  async scoreLoanRisk(
    loanData: LoanRecord,      // From Salesforce MCP (structured)
    documents: Document[]      // From Box MCP (unstructured metadata)
  ): Promise<RiskScore> {
    /**
     * Input: Data from MCPs
     * Output: Risk score with routing recommendation
     * Does NOT: Fetch loan or document data
     */
  }
  
  async routeIntent(
    query: string,
    sessionContext: SessionContext
  ): Promise<WorkflowPlan> {
    /**
     * Input: User query
     * Output: Which MCP tools to call and in what order
     * Does NOT: Call the MCP tools itself
     */
  }
}
```

### MCP Methods (Data Operations)

```typescript
// Box MCP - unchanged (unstructured data operations)
await boxMcp.extractStructured(fileId, template);
await boxMcp.queryMetadata(template, query);
await boxMcp.createDocGenBatch(templateId, data);

// Salesforce MCP - unchanged (structured data operations)
await sfMcp.getLoanPackage(loanId);
await sfMcp.listLoans(filters);
await sfMcp.classifyDocument(fileId, docType);
```

---

## Decision Flow Pattern

**Standard Pattern for all operations:**

```
1. User makes request
2. TypeSafe: route_intent() → returns MCP call plan
3. Execute MCP calls (fetch data)
4. TypeSafe: make_decision(mcp_data) → returns routing/validation
5. Execute TypeSafe's routing decision via MCPs
6. Return result to user
```

**TypeSafe is the brain, MCPs are the hands**

---

## What TypeSafe Adds That MCPs Can't Do

### 1. Cross-System Intelligence
Box can't see Salesforce, Salesforce can't see Box content.  
→ TypeSafe compares data from both to validate consistency

### 2. Confidence-Based Routing
Box AI gives a classification, but no confidence score for routing.  
→ TypeSafe evaluates Box's result in context and routes accordingly

### 3. Portfolio Pattern Analysis
Both systems see one loan at a time.  
→ TypeSafe analyzes patterns across multiple loans simultaneously

### 4. Multi-Step Orchestration
No system knows what the next step should be.  
→ TypeSafe builds and executes workflows based on context

### 5. Probabilistic Validation
Current: Binary pass/fail checks  
→ TypeSafe: Probabilistic thresholds with confidence-based escalation

### 6. Context-Aware Classification
Box classifies documents in isolation.  
→ TypeSafe validates if classification makes sense for this loan type/stage

---

## Performance Comparison

### Current Architecture (No TypeSafe)

```
User: "Classify all documents in this loan"
→ For each document:
    - LLM decides to call classifyDocument
    - Salesforce MCP → Box AI Extract
    - LLM parses result
    - LLM decides to apply
    - Salesforce MCP applies metadata
→ 5-8 seconds per document, sequential
```

### With TypeSafe Orchestration

```
User: "Classify all documents in this loan"
→ TypeSafe: route_intent() → "bulk classify workflow"
→ Fetch all documents (Box MCP) - parallel
→ Box AI extracts all types - parallel batch
→ TypeSafe validates all results - single batch API call
→ TypeSafe returns routing plan: [auto, auto, review, auto, manual]
→ Apply auto classifications (Salesforce MCP) - parallel
→ Flag others for review
→ 1-2 seconds total for 10 documents
```

**5x+ faster through batch operations and intelligent routing**

---

## Anti-Patterns to Avoid

❌ **Don't**: Have TypeSafe call Box/Salesforce APIs directly  
✅ **Do**: Have TypeSafe return which MCP tools to call

❌ **Don't**: Have TypeSafe duplicate MCP functionality  
✅ **Do**: Have TypeSafe validate/route MCP results

❌ **Don't**: Have MCPs make orchestration decisions  
✅ **Do**: Have MCPs return data, TypeSafe decides next step

❌ **Don't**: Have conversational AI parse TypeSafe results  
✅ **Do**: Have TypeSafe return structured decisions ready to execute

❌ **Don't**: Use TypeSafe for content extraction  
✅ **Do**: Use Box AI for extraction, TypeSafe for validation

---

## Implementation Checklist

When adding a new TypeSafe operation:

- [ ] Does TypeSafe call MCP tools to get data? → ❌ NO, MCPs call themselves
- [ ] Does TypeSafe make a decision about MCP data? → ✅ YES, this is TypeSafe's job
- [ ] Does TypeSafe apply the decision? → ❌ NO, return decision to MCP to apply
- [ ] Does TypeSafe provide confidence scores? → ✅ YES, always include confidence
- [ ] Does TypeSafe route based on confidence? → ✅ YES, auto/review/manual thresholds
- [ ] Can this decision be made by Box or SF alone? → If YES, don't use TypeSafe
- [ ] Does this require cross-system intelligence? → If YES, perfect for TypeSafe

---

## Summary

**Remember the layers:**

```
┌──────────────────────────────────────────────┐
│            User / AI Harness                  │  ← User interface
└──────────────────────────────────────────────┘
                    │
┌──────────────────────────────────────────────┐
│           TypeSafe Orchestrator               │  ← Decisions & routing
│  • Validates confidence                       │
│  • Routes based on scores                     │
│  • Orchestrates workflows                     │
│  • Detects patterns                           │
└──────────────────────────────────────────────┘
                    │
        ┌───────────┴───────────┐
        ▼                       ▼
┌──────────────┐        ┌──────────────┐
│   Box MCP    │        │ Salesforce   │  ← Data operations only
│  • Extract   │        │     MCP      │
│  • Classify  │        │  • Records   │
│  • DocGen    │        │  • Apex      │
│  • Sign      │        │  • Govern    │
└──────────────┘        └──────────────┘
```

**Each layer stays in its lane. TypeSafe is the brain, MCPs are the hands.**
