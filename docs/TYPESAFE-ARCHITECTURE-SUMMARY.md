# TypeSafe Architecture Summary

## The Simple Rule

```
📄 Unstructured data  → Box MCP handles it
📊 Structured data    → Salesforce MCP handles it
🧠 Orchestration      → TypeSafe handles it
```

---

## What Each Component Owns

### Box MCP (Unstructured Data)
**Owns**: Documents, files, content, bytes

**Operations**:
- Extract content from documents
- Classify documents with Box AI
- Query document metadata
- Generate documents (DocGen)
- Create sign requests (Box Sign)
- Get file previews
- Box AI Q&A on document content

**Never**:
- Makes routing decisions
- Validates cross-system consistency
- Scores risk or confidence
- Orchestrates multi-step workflows

### Salesforce MCP (Structured Data)
**Owns**: Records, fields, relationships, database

**Operations**:
- CRUD on `LOS_Loan__c` records
- Query loans (SOQL)
- Get loan packages (folder IDs, record data)
- Apply loan terms (governed Apex)
- Update record fields
- Enforce field-level security
- Handle sharing rules

**Never**:
- Extracts document content
- Makes classification decisions
- Validates document consistency
- Scores portfolio risk
- Orchestrates cross-system workflows

### TypeSafe (Orchestration & Decisions)
**Owns**: Routing, validation, scoring, workflows

**Operations**:
- Route user intent → which MCP(s) to call
- Validate MCP results for confidence
- Score risk across multiple dimensions
- Validate cross-system consistency
- Detect patterns across loans/documents
- Make confidence-based routing decisions
- Orchestrate multi-step workflows
- Provide probability distributions

**Never**:
- Calls Box APIs directly
- Calls Salesforce APIs directly
- Extracts document content
- Updates records or files
- Stores any state

---

## Data Flow Patterns

### Pattern 1: Unstructured → Structured

```
User uploads document (unstructured)
    ↓
Box MCP: extract_structured() → "Term Sheet" (Box AI makes it structured)
    ↓
TypeSafe: validate() → confidence check → decision
    ↓
Salesforce MCP: update record field (structured data operation)
```

**Who does what**:
- Box: Turns bytes into structure
- TypeSafe: Validates the structure and routes
- Salesforce: Stores the structured data

### Pattern 2: Structured → Unstructured

```
Salesforce MCP: get loan record (structured data)
    ↓
TypeSafe: route() → decide which DocGen template
    ↓
Box MCP: create_docgen_batch() → generate PDF (unstructured content)
```

**Who does what**:
- Salesforce: Provides structured merge data
- TypeSafe: Decides which template and sections
- Box: Generates unstructured document

### Pattern 3: Cross-System Validation

```
Salesforce MCP: get record → {amount: 500000, rate: 6.5}
Box MCP: get document content → "loan amount $500,000 at 6.5%"
    ↓
TypeSafe: compare() → Noul questions for each field
    ↓
TypeSafe: returns validation result with confidence
```

**Who does what**:
- Both MCPs: Provide their data independently
- TypeSafe: Makes consistency judgment across systems

---

## Code Examples

### Example 1: Document Classification with Validation

```typescript
// 1. Box extracts (unstructured → structured)
const boxResult = await boxMcp.extractStructured(fileId, {
  template: 'losDocument',
  fields: ['documentType']
});
// Box returns: { documentType: "Term Sheet" }

// 2. Salesforce gets loan context (structured data)
const loan = await salesforceMcp.getLoanPackage(loanId);
// Returns: { loanType, status, existingDocs, ... }

// 3. TypeSafe validates and routes (decision)
const decision = await typesafe.systemOne({
  state: {
    boxClassification: boxResult.documentType,
    loanType: loan.loanType,
    loanStage: loan.status,
    existingDocs: loan.documents.map(d => d.type)
  },
  questions: {
    confidence: score({
      instructions: "How confident in Box's classification?",
      criteria: [
        "High: Apply automatically",
        "Medium: Flag for review",
        "Low: Manual classification needed"
      ]
    }),
    contextuallyAppropriate: noul({
      instructions: "Does this doc type make sense for this loan?"
    })
  }
});

// 4. Route based on TypeSafe's decision
if (decision.answers.confidence.score < 1.0 && 
    decision.answers.contextuallyAppropriate.noul > 0.85) {
  // High confidence - Salesforce applies (structured data operation)
  await salesforceMcp.classifyDocument(fileId, boxResult.documentType);
} else if (decision.answers.confidence.score < 2.0) {
  // Medium confidence - flag for review
  await salesforceMcp.flagForReview(fileId, 'medium_confidence');
} else {
  // Low confidence - manual classification
  await salesforceMcp.flagForManual(fileId);
}
```

**Flow**:
1. Box: unstructured (PDF bytes) → structured (doc type string)
2. Salesforce: provides structured context (loan fields)
3. TypeSafe: makes routing decision (high/medium/low confidence)
4. Salesforce: applies decision (updates structured record)

### Example 2: Cross-System Consistency Check

```typescript
// 1. Get structured data from Salesforce
const loanRecord = await salesforceMcp.getLoan(loanId);
const { loanAmount, interestRate, ltv, termMonths } = loanRecord;

// 2. Get unstructured data from Box
const termSheetDoc = await boxMcp.getFile(termSheetFileId);
const termSheetContent = termSheetDoc.content;

// 3. TypeSafe validates consistency (decision)
const validation = await typesafe.systemOne({
  state: {
    salesforce: { loanAmount, interestRate, ltv, termMonths },
    boxDocument: termSheetContent
  },
  questions: {
    amountMatches: noul({
      instructions: "Does loan amount in SF match Box document?"
    }),
    rateMatches: noul({
      instructions: "Does interest rate in SF match Box document?"
    }),
    ltvMatches: noul({
      instructions: "Does LTV in SF match Box document?"
    }),
    discrepancySeverity: score({
      instructions: "If inconsistencies exist, how severe?",
      criteria: [
        "Minor: Formatting differences only",
        "Moderate: Small number differences",
        "Major: Material term differences",
        "Critical: Fundamental mismatch"
      ]
    })
  }
});

// 4. Act based on TypeSafe's validation
const allMatch = 
  validation.answers.amountMatches.noul > 0.95 &&
  validation.answers.rateMatches.noul > 0.95 &&
  validation.answers.ltvMatches.noul > 0.95;

if (allMatch) {
  // Consistent - proceed with closing
  await salesforceMcp.updateLoanStatus(loanId, 'Ready for Closing');
} else if (validation.answers.discrepancySeverity.score > 2.0) {
  // Critical mismatch - block and alert
  await salesforceMcp.updateLoanStatus(loanId, 'Discrepancy - Hold');
  await notifyUnderwriter('Critical mismatch detected');
} else {
  // Minor issues - flag for review
  await salesforceMcp.flagForReconciliation(loanId);
}
```

**Flow**:
1. Salesforce: provides structured record fields
2. Box: provides unstructured document content
3. TypeSafe: compares and validates (neither system can do this alone)
4. Salesforce: applies decision (updates structured status)

### Example 3: Intent Routing

```typescript
// User query comes in
const userQuery = "What's the risk profile for Harborview Logistics?";

// TypeSafe routes intent (decision)
const route = await typesafe.systemOne({
  state: { query: userQuery },
  questions: {
    primaryIntent: choice({
      instructions: "What operation should handle this?",
      criteria: {
        search_documents: "Find loan documents",
        extract_terms: "Extract terms from docs",
        score_risk: "Assess loan/portfolio risk",
        validate_policy: "Check policy compliance",
        generate_letter: "Create documents"
      }
    }),
    needsHistorical: noul({
      instructions: "Requires historical loan comparison?"
    }),
    needsPortfolio: noul({
      instructions: "Requires portfolio-wide analysis?"
    })
  }
});

// Execute based on TypeSafe's routing decision
const intent = route.answers.primaryIntent.choice;

if (intent === 'score_risk') {
  // 1. Get structured data from Salesforce
  const loans = await salesforceMcp.listLoans({
    borrower: "Harborview Logistics"
  });
  
  if (route.answers.needsHistorical.noul > 0.7) {
    // 2. Get unstructured data from Box
    const loanDocs = await Promise.all(
      loans.map(loan => boxMcp.getLoanPackage(loan.id))
    );
    
    // 3. TypeSafe scores risk across portfolio
    const riskScore = await typesafe.systemOne({
      state: {
        loans: loans.map((loan, i) => ({
          id: loan.id,
          amount: loan.loanAmount,
          ltv: loan.ltv,
          dscr: loan.dscr,
          documentCount: loanDocs[i].files.length,
          documentQuality: loanDocs[i].classificationRate
        }))
      },
      questions: {
        overallRisk: score({
          instructions: "Portfolio risk for this borrower",
          criteria: ["Low", "Medium", "High", "Critical"]
        }),
        concentrationRisk: score({
          instructions: "Borrower concentration risk",
          criteria: ["Low", "Moderate", "High", "Excessive"]
        })
      }
    });
    
    // Return risk analysis to user
    return {
      borrower: "Harborview Logistics",
      overallRisk: riskScore.answers.overallRisk.score,
      concentrationRisk: riskScore.answers.concentrationRisk.score,
      confidence: riskScore.answers.overallRisk.confidence
    };
  }
}
```

**Flow**:
1. TypeSafe: routes user intent (which workflow to execute)
2. Salesforce: provides structured loan records
3. Box: provides unstructured document metadata
4. TypeSafe: scores risk across portfolio (cross-system intelligence)
5. Return structured result to user

---

## Key Principles

### 1. TypeSafe Never Touches Raw Data
✅ TypeSafe receives data FROM MCPs  
✅ TypeSafe makes decisions ABOUT data  
✅ TypeSafe returns routing decisions TO execute  
❌ TypeSafe NEVER calls Box/Salesforce APIs

### 2. Each System Stays In Its Lane
✅ Box handles bytes and content  
✅ Salesforce handles records and fields  
✅ TypeSafe handles routing and validation  
❌ No system tries to do another's job

### 3. Structured vs Unstructured Is Clear
**Unstructured** = Document content, PDFs, text extraction, Box AI  
**Structured** = Record fields, SOQL queries, Apex governance  
**Decisions** = Which one to call, when, and what to do with results

### 4. TypeSafe Is Stateless
✅ TypeSafe receives context in each request  
✅ TypeSafe returns decisions immediately  
❌ TypeSafe does NOT store state  
❌ TypeSafe does NOT maintain sessions

### 5. Confidence Drives Routing
Every TypeSafe decision includes confidence:
- **High confidence** → Auto-execute
- **Medium confidence** → Flag for review
- **Low confidence** → Escalate to human

This is impossible without TypeSafe's probabilistic outputs.

---

## Anti-Patterns

❌ **Wrong**: TypeSafe extracts document content  
✅ **Right**: Box extracts, TypeSafe validates confidence

❌ **Wrong**: TypeSafe updates Salesforce records  
✅ **Right**: TypeSafe decides, Salesforce updates

❌ **Wrong**: TypeSafe calls Box API for metadata  
✅ **Right**: Box MCP provides metadata, TypeSafe analyzes

❌ **Wrong**: Salesforce validates document content  
✅ **Right**: Box provides content, TypeSafe validates

❌ **Wrong**: Box scores loan risk  
✅ **Right**: Box provides docs, Salesforce provides records, TypeSafe scores

---

## Decision Tree: Which Component?

```
Is it document content/bytes/files?
  → Box MCP

Is it record fields/database/CRUD?
  → Salesforce MCP

Is it "which tool to call"?
  → TypeSafe

Is it "should I trust this result"?
  → TypeSafe

Is it "what's the risk/confidence/probability"?
  → TypeSafe

Is it "do these two systems agree"?
  → TypeSafe (only it can see both)

Is it "what's the pattern across X loans"?
  → TypeSafe (cross-system intelligence)
```

---

## Summary

The architecture is simple once you remember the rule:

**Unstructured → Box | Structured → Salesforce | Decisions → TypeSafe**

Each component does one thing well. TypeSafe orchestrates but never operates. MCPs operate but never orchestrate.

The result: Fast, confident, intelligent loan processing with clear separation of concerns.
