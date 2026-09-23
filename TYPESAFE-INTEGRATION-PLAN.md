# TypeSafe.ai Integration - Execution Plan

> **Superseded.** The `TypeSafeOrchestrator` package this plan describes was removed. The working implementation is [`apps/loan-agent`](apps/loan-agent/README.md), which calls TypeSafe over REST. Do not `npm install typesafe-sdk`: that npm name belongs to an unrelated placeholder package, not TypeSafe.

## Executive Summary

This plan integrates **TypeSafe.ai's Jev model** as the intelligent orchestration layer between users and the Box MCP + Salesforce MCP connectors. TypeSafe becomes the "harness" that makes all routing, classification, and validation decisions while Box and Salesforce MCP tools handle data operations.

**Architecture Philosophy**:
- **TypeSafe**: Orchestration, decision-making, routing, validation, multi-system intelligence
- **Box MCP**: Document operations (metadata, AI, DocGen, Sign)
- **Salesforce MCP**: Record operations (CRUD, governance, Apex actions)

**Goal**: Achieve 10-20x faster decision-making by using TypeSafe's System One API for all orchestration logic, while preserving the existing Box and Salesforce MCP tools for data operations.

**Key Integration Points**:
1. Intent routing → which MCP tool(s) to call (Choice)
2. Document classification → Box metadata application (Choice)
3. Cross-system validation → Box doc ↔ Salesforce record consistency (Noul)
4. Loan risk scoring → underwriting routing decisions (Score)
5. Credit policy validation → approval gating (Noul)
6. Portfolio intelligence → cross-loan pattern analysis (Score/Choice)
7. Document assembly orchestration → DocGen template selection (Choice)
8. Borrower communication analysis → tone/urgency scoring (Score/Noul)

---

## Current Architecture Analysis

### Existing Decision Points

| Operation | Current Method | Latency | Token Cost |
|-----------|---------------|---------|------------|
| Document classification | Box AI Extract | ~2-3s | ~500 tokens |
| Risk assessment | Conversational AI analysis | ~5-8s | ~1,500 tokens |
| Policy validation | Box AI Hub QA | ~3-5s | ~800 tokens |
| Intent routing | LLM prompt engineering | ~2-4s | ~400 tokens |
| Term extraction | Box AI Extract | ~3-4s | ~600 tokens |

**Total for typical loan review**: ~15-24s, ~3,800 tokens

### Pain Points

1. **Conversational AI overhead**: Text generation when we need structured answers
2. **Inconsistent outputs**: Free-form responses require parsing
3. **No confidence scoring**: Hard to route low-confidence decisions to humans
4. **High latency**: Multiple round-trips for sequential decisions
5. **Cost**: Paying for generated text we don't need

---

## Advanced Orchestration: Operations Impossible Without TypeSafe

These operations require **cross-system intelligence** that neither Box nor Salesforce can provide alone. TypeSafe orchestrates data from both systems to enable entirely new capabilities.

### 1. Cross-System Consistency Validation

**Problem**: Box documents and Salesforce records can drift out of sync. No single system knows if they match.

**TypeSafe Solution**:
```typescript
// Get data from both systems via MCP
const loanRecord = await salesforceMcp.getLoan("LN-2026-0042");
const termSheetDoc = await boxMcp.getFile(termSheetId);

// TypeSafe evaluates consistency
const response = await typesafe.systemOne({
    state: {
        salesforce_record: {
            amount: loanRecord.Loan_Amount__c,
            rate: loanRecord.Interest_Rate__c,
            ltv: loanRecord.LTV__c,
            term: loanRecord.Term_Months__c
        },
        box_document: termSheetDoc.content
    },
    questions: {
        amount_matches: {
            type: 'noul',
            instructions: "Does the loan amount in the Salesforce record match the amount stated in the Box document?"
        },
        rate_matches: {
            type: 'noul',
            instructions: "Does the interest rate in the Salesforce record match the rate in the Box document?"
        },
        terms_consistent: {
            type: 'noul',
            instructions: "Are the loan terms in Salesforce and Box internally consistent and complete?"
        },
        discrepancy_severity: {
            type: 'score',
            instructions: "If inconsistencies exist, how severe are they?",
            criteria: [
                "Minor: Small formatting differences, no material impact",
                "Moderate: Numbers differ slightly, requires review",
                "Major: Material differences in key terms",
                "Critical: Fundamental mismatch, blocks closing"
            ]
        }
    }
});

// Act based on cross-system intelligence
if (
    response.answers.amount_matches.noul > 0.95 &&
    response.answers.rate_matches.noul > 0.95 &&
    response.answers.terms_consistent.noul > 0.95
) {
    await approveForClosing();
} else if (response.answers.discrepancy_severity.score > 2.0) {
    await escalateCriticalMismatch();
} else {
    await flagForReconciliation();
}
```

**Why This Is Fancy**: Neither Box nor Salesforce can validate their own data against the other. TypeSafe reads from both (via MCPs) and makes consistency judgments impossible for either system alone.

### 2. Portfolio Risk Intelligence

**Problem**: Risk patterns across loans are invisible when analyzing one loan at a time.

**TypeSafe Solution**:
```typescript
// Get portfolio data from Salesforce MCP
const activeLoans = await salesforceMcp.listLoans({ status: "Underwriting,Approved" });

// Get document quality scores from Box MCP for each loan
const loanPackages = await Promise.all(
    activeLoans.map(loan => boxMcp.getLoanPackage(loan.id))
);

// TypeSafe evaluates portfolio-level patterns
const response = await typesafe.systemOne({
    state: {
        portfolio: activeLoans.map((loan, index) => {
            const pkg = loanPackages[index];
            return {
                loan_id: loan.id,
                borrower: loan.borrower,
                amount: loan.amount,
                ltv: loan.ltv,
                dscr: loan.dscr,
                risk_rating: loan.risk_rating,
                document_count: pkg.documents.length,
                document_types: pkg.documents.map(doc => doc.type)
            };
        })
    },
    questions: {
        concentration_risk: {
            type: 'score',
            instructions: "Assess borrower/industry concentration risk",
            criteria: [
                "Low: Well-diversified portfolio",
                "Moderate: Some concentration in borrower/industry",
                "High: Heavy concentration, limited diversity",
                "Critical: Excessive concentration, systemic risk"
            ]
        },
        documentation_quality_trend: {
            type: 'score',
            instructions: "Overall trend in documentation completeness",
            criteria: [
                "Improving: Recent loans better documented",
                "Stable: Consistent documentation quality",
                "Declining: Recent loans less complete",
                "Poor: Widespread documentation gaps"
            ]
        },
        outlier_loans: {
            type: 'choice',
            instructions: "Which loans are statistical outliers requiring attention?",
            criteria: Object.fromEntries(
                activeLoans.map(loan => [
                    loan.id,
                    `${loan.borrower} $${loan.amount.toLocaleString()}`
                ])
            )
        },
        portfolio_health: {
            type: 'score',
            instructions: "Overall portfolio health assessment",
            criteria: ["Excellent", "Good", "Fair", "Poor", "Critical"]
        }
    }
});

// Generate portfolio risk report
if (response.answers.portfolio_health.score > 3.0) {
    await alertPortfolioManagement();
}
if (response.answers.concentration_risk.score > 2.0) {
    await recommendDiversification();
}
await highlightOutliers(response.answers.outlier_loans.choice);
```

**Why This Is Fancy**: Combines Salesforce loan records + Box document inventories to detect portfolio-level patterns neither system can see independently.

### 3. Intelligent Document Assembly

**Problem**: Different loan types need different commitment letter sections, but template selection is manual.

**TypeSafe Solution**:
```typescript
// Get loan data from Salesforce MCP
const loan = await salesforceMcp.getLoan(loanId);

// Get available DocGen templates from Box MCP
const templates = await boxMcp.listDocgenTemplates();

// Get borrower communication history from Salesforce MCP
const communications = await salesforceMcp.getAccountTimeline(loan.borrowerAccountId);

// TypeSafe orchestrates intelligent assembly
const response = await typesafe.systemOne({
    state: {
        loan_type: loan.loanType,
        loan_amount: loan.amount,
        borrower_sophistication: communications,
        special_conditions: loan.underwritingNotes
    },
    questions: {
        template_base: {
            type: 'choice',
            instructions: "Which commitment letter template best fits this loan?",
            criteria: Object.fromEntries(
                templates.map(t => [t.id, `${t.name}: ${t.description}`])
            )
        },
        include_ltv_covenant: {
            type: 'noul',
            instructions: "Should the letter include detailed LTV covenant language?"
        },
        include_guaranty_detail: {
            type: 'noul',
            instructions: "Should the letter include detailed personal guaranty terms?"
        },
        include_collateral_schedule: {
            type: 'noul',
            instructions: "Should the letter include a detailed collateral schedule?"
        },
        tone: {
            type: 'score',
            instructions: "What tone should the letter take?",
            criteria: [
                "Simple: Plain language, minimal jargon",
                "Standard: Professional but accessible",
                "Technical: Detailed legal language",
                "Complex: Highly technical with full detail"
            ]
        }
    }
});

// Assemble document via Box MCP with TypeSafe-selected components
const templateId = response.answers.template_base.choice;
const sections = {
    include_ltv: response.answers.include_ltv_covenant.noul > 0.7,
    include_guaranty: response.answers.include_guaranty_detail.noul > 0.7,
    include_collateral: response.answers.include_collateral_schedule.noul > 0.7,
    complexity_level: Math.floor(response.answers.tone.score)
};

// Box MCP generates with intelligent section selection
await boxMcp.createDocgenBatch(templateId, loanData, sections);
```

**Why This Is Fancy**: Combines loan attributes (SF) + templates (Box) + borrower communication history (SF) to intelligently customize document generation beyond simple merge fields.

### 4. Borrower Communication Intelligence

**Problem**: Loan officers need to prioritize responses based on urgency/risk, but email/portal messages are unstructured.

**TypeSafe Solution**:
```typescript
// Get borrower communication from Salesforce MCP (could be email, portal message, etc)
const message = await salesforceMcp.getLatestBorrowerMessage(loanId);

// Get loan status from Salesforce MCP
const loan = await salesforceMcp.getLoan(loanId);

// Get recent document activity from Box MCP
const recentDocs = await boxMcp.queryMetadata({
    template: "losDocument",
    query: `loanReference='${loan.loanId}' AND modifiedAfter='-7 days'`
});

// TypeSafe analyzes communication in context
const response = await typesafe.systemOne({
    state: {
        message: message.content,
        loan_status: loan.status,
        loan_amount: loan.amount,
        closing_date: loan.targetClosingDate,
        recent_activity: recentDocs.map(d => ({ doc: d.name, date: d.modified }))
    },
    questions: {
        urgency: {
            type: 'score',
            instructions: "How urgent is this communication?",
            criteria: [
                "Routine: Standard update, no time pressure",
                "Important: Needs response in 1-2 days",
                "Urgent: Needs response today",
                "Critical: Immediate attention, blocks closing"
            ]
        },
        sentiment: {
            type: 'score',
            instructions: "Borrower sentiment",
            criteria: ["Positive", "Neutral", "Concerned", "Frustrated", "Angry"]
        },
        request_type: {
            type: 'choice',
            instructions: "What is the borrower asking for?",
            criteria: {
                status_update: "Wants progress update",
                document_issue: "Problem with documents",
                term_clarification: "Questions about loan terms",
                timeline_concern: "Worried about closing timeline",
                new_information: "Providing new financial info",
                complaint: "Expressing dissatisfaction"
            }
        },
        risk_to_deal: {
            type: 'noul',
            instructions: "Does this message indicate risk to deal closure?"
        },
        requires_escalation: {
            type: 'noul',
            instructions: "Should this be escalated beyond the loan officer?"
        }
    }
});

// Intelligent routing based on cross-system context
if (response.answers.urgency.score >= 2.5 || response.answers.risk_to_deal.noul > 0.7) {
    await priorityFlag(message, "High");
    if (response.answers.requires_escalation.noul > 0.6) {
        await escalateToManager();
    }
}

if (response.answers.sentiment.score >= 3.0) {  // Frustrated or angry
    await assignToSeniorLoanOfficer();
}

// Suggest response based on request type + context
await suggestResponseTemplate({
    requestType: response.answers.request_type.choice,
    urgency: response.answers.urgency.score,
    includeStatusDetails: recentDocs.length > 0
});
```

**Why This Is Fancy**: Analyzes borrower communication in the context of loan status (SF) + recent document activity (Box) to provide intelligent triage and response suggestions.

### 5. Predictive Loan Outcome Modeling

**Problem**: Want to predict whether a loan will close successfully based on early indicators.

**TypeSafe Solution**:
```typescript
// Get current loan from Salesforce MCP
const currentLoan = await salesforceMcp.getLoan(loanId);

// Get document package from Box MCP
const docs = await boxMcp.getLoanPackage(loanId);

// Get historical closed loans from Salesforce MCP
const historicalLoans = await salesforceMcp.listLoans({ status: "Closed", limit: 100 });

// Get their document patterns from Box MCP
const historicalPatterns = await Promise.all(
    historicalLoans.map(async (loan) => ({
        loan,
        docCountAt30Days: await boxMcp.countDocsAsOf(loan.id, { daysSinceApp: 30 }),
        classificationRate: await boxMcp.getClassificationRate(loan.id),
        revisionCount: await boxMcp.getAvgRevisions(loan.id)
    }))
);

// Calculate current loan's position
const daysSinceApp = Math.floor(
    (Date.now() - new Date(currentLoan.createdDate).getTime()) / (1000 * 60 * 60 * 24)
);
const currentDocCount = docs.files.length;
const currentClassificationRate = 
    docs.files.filter(d => d.classified).length / docs.files.length;

// TypeSafe predicts outcome based on patterns
const response = await typesafe.systemOne({
    state: {
        currentLoan: {
            daysSinceApp,
            docCount: currentDocCount,
            classificationRate: currentClassificationRate,
            ltv: currentLoan.ltv,
            amount: currentLoan.amount
        },
        historicalSuccessful: historicalPatterns.filter(
            p => p.loan.closedSuccessfully
        ),
        historicalFailed: historicalPatterns.filter(
            p => !p.loan.closedSuccessfully
        )
    },
    questions: {
        likelyOutcome: {
            type: 'choice',
            instructions: "Based on current progress vs historical patterns, what is the likely outcome?",
            criteria: {
                onTrack: "Progressing normally, likely to close",
                atRisk: "Falling behind benchmarks, needs attention",
                unlikely: "Significantly behind, unlikely to close without intervention"
            }
        },
        completionProbability: {
            type: 'noul',
            instructions: "Will this loan close successfully?"
        },
        daysToClose: {
            type: 'score',
            instructions: "Estimated days until closing",
            criteria: ["0-30 days", "31-60 days", "61-90 days", "90+ days", "Won't close"]
        },
        recommendedAction: {
            type: 'choice',
            instructions: "What should the loan officer do?",
            criteria: {
                continue: "Continue standard process",
                expedite: "Expedite document collection",
                intervene: "Direct intervention needed",
                escalate: "Escalate to management"
            }
        }
    }
});

// Act on prediction
if (response.answers.completionProbability.noul < 0.5) {
    await alertLoanOfficer(
        "Loan at risk of not closing",
        {
            recommendedAction: response.answers.recommendedAction.choice,
            confidence: response.answers.likelyOutcome.confidence
        }
    );
}

```

**Why This Is Fancy**: Combines current loan status (SF) + current document progress (Box) + historical loan outcomes (SF) + historical document patterns (Box) to predict outcomes - impossible for either system alone.

### 6. Anomaly Detection in Document Sets

**Problem**: Unusual document patterns can indicate fraud, errors, or process issues, but no system tracks cross-document patterns.

**TypeSafe Solution**:
```typescript
// Get all loan documents from Box MCP
const loanDocs = await boxMcp.getLoanPackage(loanId);

// Get loan metadata from Salesforce MCP
const loan = await salesforceMcp.getLoan(loanId);

// Get typical document patterns for similar loans
const similarLoans = await salesforceMcp.listLoans({
    loanType: loan.loanType,
    amountRange: { min: loan.amount * 0.8, max: loan.amount * 1.2 },
    status: "Closed"
});
const typicalPatterns = await Promise.all(
    similarLoans.map(l => boxMcp.getLoanPackage(l.id))
);

// TypeSafe detects anomalies
const response = await typesafe.systemOne({
    state: {
        currentLoanDocs: loanDocs.files.map(doc => ({
            type: doc.documentType,
            size: doc.size,
            pages: doc.pageCount,
            modifiedCount: doc.versionCount,
            uploadTime: doc.createdAt
        })),
        typicalPatterns: typicalPatterns.map(pkg => ({
            docCount: pkg.files.length,
            docTypes: pkg.files.map(d => d.documentType),
            avgRevisions: pkg.files.reduce((sum, d) => sum + d.versionCount, 0) / pkg.files.length
        }))
    },
    questions: {
        missingDocs: {
            type: 'choice',
            instructions: "Which critical document types are missing?",
            criteria: {
                none: "All expected documents present",
                financial: "Missing financial statements",
                appraisal: "Missing appraisal",
                tax: "Missing tax returns",
                insurance: "Missing insurance docs"
            }
        },
        unusualRevisionCount: {
            type: 'noul',
            instructions: "Does this loan have an unusually high number of document revisions?"
        },
        uploadTimingAnomaly: {
            type: 'noul',
            instructions: "Were documents uploaded in an unusual pattern (e.g., all at once, or unusual gaps)?"
        },
        duplicateRisk: {
            type: 'score',
            instructions: "Risk of duplicate or contradictory documents",
            criteria: ["No risk", "Low risk", "Moderate risk", "High risk", "Confirmed duplicates"]
        },
        fraudIndicators: {
            type: 'score',
            instructions: "Overall fraud risk indicators",
            criteria: [
                "None: Normal documentation pattern",
                "Low: Minor inconsistencies",
                "Moderate: Multiple red flags",
                "High: Significant fraud indicators",
                "Critical: Clear fraud pattern"
            ]
        }
    }
});

// Alert on anomalies
if (response.answers.fraudIndicators.score > 2.0) {
    await flagForFraudReview(
        loanId,
        {
            missing: response.answers.missingDocs.choice,
            unusualRevisions: response.answers.unusualRevisionCount.noul,
            timingAnomaly: response.answers.uploadTimingAnomaly.noul,
            duplicates: response.answers.duplicateRisk.score
        }
    );
}
```

**Why This Is Fancy**: Detects patterns across the entire document set by comparing current loan (Box + SF) against historical patterns (Box + SF) to identify anomalies neither system can see independently.

---

## TypeSafe Integration Opportunities

### 1. Document Classification Validation (Score)

**Current**: `LosClassifyDocument` → Box AI Extract → apply metadata (no validation)

**Better Architecture**: Let Box AI do what it's best at (extract), TypeSafe validates confidence

```typescript
// Box MCP extracts document type (it's good at this!)
const boxResult = await boxMcp.extractStructured({
    fileId,
    metadataTemplate: "losDocument",
    fields: ["documentType"]
});

// TypeSafe validates the extraction confidence and context
const response = await typesafe.systemOne({
    state: {
        boxClassification: boxResult.documentType,
        fileName,
        loanType: loan.loanType,
        loanStage: loan.status,
        existingDocuments: loanPackage.documents.map(doc => doc.type)
    },
    questions: {
        classificationConfidence: {
            type: 'score',
            instructions: "How confident should we be in Box's classification?",
            criteria: [
                "High: Clear match, apply automatically",
                "Medium: Reasonable match, flag for quick review",
                "Low: Uncertain, needs manual classification",
                "Wrong: Box misclassified, override needed"
            ]
        },
        contextuallyAppropriate: {
            type: 'noul',
            instructions: "Does this document type make sense for this loan type and stage?"
        },
        duplicateRisk: {
            type: 'noul',
            instructions: "Is this a duplicate of an existing document in the package?"
        }
    }
});

// TypeSafe makes the routing decision
const confidenceScore = response.answers.classificationConfidence.score;
const isAppropriate = response.answers.contextuallyAppropriate.noul;
const isDuplicate = response.answers.duplicateRisk.noul;

if (confidenceScore < 1.0 && isAppropriate > 0.85 && isDuplicate < 0.3) {
    // High confidence - apply Box's classification automatically
    await applyMetadata(fileId, boxResult.documentType);
} else if (confidenceScore < 2.0) {
    // Medium confidence - apply but flag for review
    await applyMetadata(fileId, boxResult.documentType);
    await flagForQuickReview(fileId, "medium_confidence");
} else {
    // Low confidence or contextual issues - manual classification
    await flagForManualClassification(fileId, boxResult.documentType, confidenceScore);
}
```

**Benefits**:
- Box AI does extraction (its strength)
- TypeSafe validates context and confidence (its strength)
- Catches duplicates and inappropriate classifications
- Confidence-based routing (70-80% auto-applied, 20-30% reviewed)

### 2. Loan Risk Scoring (Score)

**Current**: Conversational AI analyzes loan, returns free-form risk assessment

**With TypeSafe**:
```typescript
const response = await client.systemOne({
    state: loanTermsAndFinancials,
    questions: {
        creditRisk: {
            type: 'score',
            instructions: "Assess overall credit risk",
            criteria: [
                "Low risk: Strong financials, conservative leverage, proven track record",
                "Medium risk: Adequate financials, moderate leverage, some operational concerns",
                "High risk: Weak financials, aggressive leverage, significant credit issues",
                "Critical risk: Severe financial distress, policy violations, immediate concerns"
            ]
        },
        collateralAdequacy: {
            type: 'score',
            instructions: "Evaluate collateral coverage",
            criteria: [
                "Excellent: LTV <60%, high-quality assets, strong liquidation value",
                "Good: LTV 60-75%, standard assets, adequate liquidation value",
                "Fair: LTV 75-85%, weaker assets, limited liquidation value",
                "Poor: LTV >85%, weak assets, questionable liquidation value"
            ]
        }
    }
});

const creditScore = response.answers.creditRisk.score;
const collateralScore = response.answers.collateralAdequacy.score;

// Composite risk rating with code-controlled weights
const compositeRisk = (creditScore * 0.7) + (collateralScore * 0.3);

if (compositeRisk > 2.5) {
    await flagForSeniorReview();
} else if (compositeRisk > 1.5) {
    await assignToExperiencedUnderwriter();
} else {
    await proceedWithStandardUnderwriting();
}
```

**Benefits**:
- Numeric scores enable programmatic routing
- Confidence scores show model certainty
- Fast (sub-second) vs multi-second AI analysis
- Probabilities reveal uncertainty distribution

### 3. Credit Policy Validation (Noul)

**Current**: Box Hub QA asks policy library, parse yes/no answer

**With TypeSafe**:
```typescript
const response = await client.systemOne({
    state: {
        loanTerms,
        creditPolicy: creditPolicyDocument
    },
    questions: {
        ltvCompliant: {
            type: 'noul',
            instructions: "Does the LTV ratio comply with credit policy limits?"
        },
        dscrCompliant: {
            type: 'noul',
            instructions: "Does the DSCR meet or exceed policy minimums?"
        },
        collateralAcceptable: {
            type: 'noul',
            instructions: "Is the collateral type approved under policy?"
        },
        guarantyAdequate: {
            type: 'noul',
            instructions: "Does the personal guaranty meet policy requirements?"
        }
    }
});

// Get probability of each compliance check
const ltvProb = response.answers.ltvCompliant.noul;
const dscrProb = response.answers.dscrCompliant.noul;
const collateralProb = response.answers.collateralAcceptable.noul;
const guarantyProb = response.answers.guarantyAdequate.noul;

// Fail if any check has <50% probability of compliance
const policyViolations: string[] = [];
if (ltvProb < 0.5) {
    policyViolations.push(`LTV non-compliant (confidence: ${(ltvProb * 100).toFixed(1)}%)`);
}
if (dscrProb < 0.5) {
    policyViolations.push(`DSCR non-compliant (confidence: ${(dscrProb * 100).toFixed(1)}%)`);
}
if (collateralProb < 0.5) {
    policyViolations.push(`Collateral not acceptable (confidence: ${(collateralProb * 100).toFixed(1)}%)`);
}
if (guarantyProb < 0.5) {
    policyViolations.push(`Guaranty inadequate (confidence: ${(guarantyProb * 100).toFixed(1)}%)`);
}

if (policyViolations.length > 0) {
    await requireExceptionApproval(policyViolations);
}
```

**Benefits**:
- Parallel evaluation (all checks in one request)
- Probabilistic thresholds (not just binary yes/no)
- Faster than sequential Hub QA calls
- Atomic decisions composable in code

### 4. Intent Routing (Choice)

**Current**: LLM prompt engineering to classify user intent

**With TypeSafe**:
```typescript
const response = await client.systemOne({
    state: { userQuery },
    questions: {
        intent: {
            type: 'choice',
            instructions: "What is the user trying to accomplish?",
            criteria: {
                searchDocuments: "Find or search for loan documents",
                extractTerms: "Extract loan terms from documents",
                validatePolicy: "Check compliance with credit policy",
                generateLetter: "Create commitment or other letter",
                prepareSignature: "Send documents for signing",
                reviewHistory: "Compare with prior loans or analyze history",
                updateRecord: "Modify loan record fields"
            }
        }
    }
});

const intent = response.answers.intent.choice;
const confidence = response.answers.intent.confidence;

// Route to appropriate connector based on intent
if (confidence > 0.8) {
    switch (intent) {
        case "searchDocuments":
            await callBoxMetadataSearch();
            break;
        case "extractTerms":
            await callLosExtractLoanTerms();
            break;
        case "validatePolicy":
            await callTypesafePolicyValidation();
            break;
        // ... etc
    }
} else {
    // Low confidence - route to conversational AI for clarification
    await callConversationalAiForDisambiguation();
}
```

**Benefits**:
- Single-shot classification vs multi-turn conversation
- Confidence-based fallback to conversational AI
- Deterministic routing logic
- Fast intent detection (sub-second)

### 5. Batch Decision Making (Speculative Fan-Out)

**TypeSafe Pattern**: Send all possible questions in one request, decide in code which to act on

```typescript
const response = await client.systemOne({
    state: loanPackage,
    questions: {
        // Classification
        docTypes: Object.fromEntries(
            documents.map((doc, i) => [`doc_${i}`, { type: 'choice', /* ... */ }])
        ),
        
        // Risk assessment
        creditRisk: { type: 'score', /* ... */ },
        collateralRisk: { type: 'score', /* ... */ },
        
        // Policy checks
        ltvOk: { type: 'noul', /* ... */ },
        dscrOk: { type: 'noul', /* ... */ },
        collateralOk: { type: 'noul', /* ... */ },
        
        // Readiness gates
        readyForUnderwriting: { type: 'noul', /* ... */ },
        readyForApproval: { type: 'noul', /* ... */ },
        readyForClosing: { type: 'noul', /* ... */ }
    }
});

// All answers returned in single response - decide in code what to do
```

**Benefits**:
- One API call for entire decision tree
- Speculative evaluation (ask questions you might not need)
- Massive parallelization vs sequential decisions

---

## Proposed Architecture

### System Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                         User Layer                           │
│  (Claude Desktop, Amazon Quick, Slack, ChatGPT, Agentforce)  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              TypeSafe Orchestration Layer                    │
│                (Intelligent Decision Engine)                 │
│                                                              │
│  • Intent routing (which MCP to call)                        │
│  • Multi-step workflow orchestration                         │
│  • Cross-system validation (Box ↔ Salesforce)               │
│  • Document classification routing                           │
│  • Risk scoring & approval routing                           │
│  • Portfolio intelligence & pattern detection                │
│  • Confidence-based human escalation                         │
└─────────────────────────────────────────────────────────────┘
                              │
         ┌────────────────────┴────────────────────┐
         ▼                                         ▼
┌──────────────────────┐              ┌──────────────────────┐
│   Box MCP Connector  │              │  Salesforce LOS MCP  │
│  (Data Operations)   │              │  (Data Operations)   │
│                      │              │                      │
│ • query_metadata     │              │ • getLoanPackage     │
│ • box_ai_ask         │              │ • listLoans          │
│ • box_ai_extract     │              │ • extractLoanTerms   │
│ • create_docgen      │              │ • applyLoanTerms     │
│ • prepare_sign       │              │ • prepareSignature   │
│ • get_file_preview   │              │ • classifyDocument   │
└──────────────────────┘              └──────────────────────┘
         │                                         │
         ▼                                         ▼
┌─────────────────────────────────────────────────────────────┐
│                   Data & Services Layer                      │
│                                                              │
│   Box Content        Salesforce CRM        Credit Policy    │
│   (Documents)        (LOS_Loan__c)         (Hub Library)    │
└─────────────────────────────────────────────────────────────┘
```

**Key Principle**: TypeSafe NEVER calls Box/Salesforce APIs directly. It only decides WHICH MCP tool to call and HOW to interpret results. The MCP connectors remain the sole interface to Box and Salesforce.

### Decision Flow

```
User Query
    │
    ▼
┌──────────────────────────────────────┐
│ TypeSafe: Route Intent (Choice)      │
│ "Which operation(s) should handle    │
│  this user request?"                 │
└──────────────────────────────────────┘
    │
    ├→ "search" → ┌─────────────────────────────────┐
    │             │ TypeSafe: Classify Query (Choice)│
    │             │ → Box MCP: query_metadata        │
    │             │ TypeSafe: Validate Results       │
    │             └─────────────────────────────────┘
    │
    ├→ "classify" → ┌────────────────────────────────┐
    │               │ Salesforce MCP: getLoanPackage │
    │               │ TypeSafe: Classify Doc (Choice) │
    │               │ Salesforce MCP: apply metadata  │
    │               └────────────────────────────────┘
    │
    ├→ "validate" → ┌────────────────────────────────┐
    │               │ TypeSafe: Multi-check (Noul)   │
    │               │ Box MCP: get docs              │
    │               │ Salesforce MCP: get record     │
    │               │ TypeSafe: Cross-system compare │
    │               └────────────────────────────────┘
    │
    └→ "complex" → ┌─────────────────────────────────┐
                   │ TypeSafe: Orchestrate Workflow  │
                   │ 1. Risk Score → route           │
                   │ 2. Get docs (Box MCP)           │
                   │ 3. Extract terms (SF MCP)       │
                   │ 4. Validate (TypeSafe)          │
                   │ 5. Generate letter (Box MCP)    │
                   │ 6. Confidence check → human?    │
                   └─────────────────────────────────┘
```

### Integration Layer Design

**New Component**: `TypeSafeOrchestrator`

Located: `los-salesforce-project/services/typesafe_orchestrator.py`

```typescript
class TypeSafeOrchestrator {
    /**
     * Orchestrates decisions between Box MCP and Salesforce MCP.
     * TypeSafe makes routing/validation decisions, MCPs handle data operations.
     */
    
    private typesafe: TypeSafeClient;
    private box: BoxMCP;
    private sf: SalesforceMCP;
    
    constructor(typesafeApiKey: string, boxMcp: BoxMCP, salesforceMcp: SalesforceMCP) {
        this.typesafe = new TypeSafeClient({ apiKey: typesafeApiKey });
        this.box = boxMcp;
        this.sf = salesforceMcp;
    }
    
    async validateDocumentClassification(
        fileId: string,
        boxClassification: string,
        loanContext: Record<string, any>
    ): Promise<ClassificationValidation> {
        /**
         * Box MCP extracts the type, TypeSafe validates confidence and context.
         * Returns routing decision: auto-apply, flag-for-review, or manual.
         */
    }
    
    async scoreLoanRisk(loanId: string): Promise<RiskScore> {
        /**
         * Fetches data from both MCPs, TypeSafe scores risk and routes.
         * Returns composite risk score with routing recommendation.
         */
    }
    
    async validateCrossSystemConsistency(
        loanId: string
    ): Promise<ConsistencyValidation> {
        /**
         * Compares Box documents vs Salesforce record, TypeSafe validates consistency.
         * Returns discrepancies and severity scoring.
         */
    }
    
    async routeUserIntent(query: string, context: Record<string, any>): Promise<IntentRoute> {
        /**
         * TypeSafe classifies intent and returns which MCP tools to call.
         * Returns tool sequence and parameters.
         */
    }
    
    async orchestrateWorkflow(
        workflowType: string,
        parameters: Record<string, any>
    ): Promise<WorkflowResult> {
        /**
         * Orchestrates multi-step workflows across MCPs with TypeSafe decisions.
         * Returns workflow outcome with confidence scores at each step.
         */
    }
}
```

**Key Principle**: TypeSafe NEVER calls Box/Salesforce APIs directly. It only:
1. Receives data fetched by MCPs
2. Makes decisions about that data
3. Returns routing/validation results
4. MCPs handle all data operations

---

## Implementation Phases

### Phase 1: Foundation (Week 1)
- [ ] Install TypeSafe Python SDK
- [ ] Configure API key in environment
- [ ] Create `TypeSafeDecisionService` wrapper
- [ ] Add unit tests for basic operations
- [ ] Document TypeSafe integration in CLAUDE.md

### Phase 2: Document Classification (Week 1-2)
- [ ] Implement Choice-based document classifier
- [ ] Integrate with `LosClassifyDocument` Apex class
- [ ] Add confidence-based routing logic
- [ ] Test against sample loan documents
- [ ] Benchmark vs Box AI classification

### Phase 3: Loan Risk Scoring (Week 2-3)
- [ ] Implement Score-based risk assessment
- [ ] Define risk level criteria with credit team
- [ ] Create composite scoring logic
- [ ] Add confidence thresholds for routing
- [ ] Integrate with underwriting workflow

### Phase 4: Policy Validation (Week 3-4)
- [ ] Implement Noul-based policy checks
- [ ] Map credit policy rules to questions
- [ ] Create parallel validation pipeline
- [ ] Add exception workflow for violations
- [ ] Test against historical loan data

### Phase 5: Intent Routing (Week 4)
- [ ] Implement Choice-based intent classifier
- [ ] Map intents to connector operations
- [ ] Add confidence-based fallback logic
- [ ] Integrate with all AI harnesses
- [ ] Test user query routing

### Phase 6: Demo Integration (Week 5)
- [ ] Update DEMO-CLICKPATH.md with TypeSafe beats
- [ ] Add TypeSafe operations to storyboard
- [ ] Create visualization of confidence scores
- [ ] Update borrower portal with risk indicators
- [ ] Record demo video showcasing speed gains

### Phase 7: Optimization & Benchmarking (Week 6)
- [ ] Implement batch decision patterns
- [ ] Optimize state preparation
- [ ] Run performance benchmarks
- [ ] Document cost savings
- [ ] Create comparison report

---

## Technical Specifications

### Environment Configuration

Add to `.env`:
```bash
# TypeSafe API
TYPESAFE_API_KEY=your_api_key_here
TYPESAFE_MODEL=jev-latest
```

### TypeScript Dependencies

Add to `package.json`:
```json
{
  "dependencies": {
    "typesafe-sdk": "^1.0.0"
  }
}
```

Install:
```bash
npm install typesafe-sdk
# or
pnpm add typesafe-sdk
```

### Service Interface

```typescript
// Document Classification Response
interface DocumentClassificationResult {
  docType: string;              // Selected type
  confidence: number;           // 0-1 confidence score
  probabilities: Record<string, number>;  // All type probabilities
  needsReview: boolean;         // True if confidence < threshold
}

// Risk Score Response
interface RiskScore {
  creditScore: number;          // 0-3 weighted score
  collateralScore: number;      // 0-3 weighted score
  compositeScore: number;       // Weighted combination
  riskLevel: 'Low' | 'Medium' | 'High' | 'Critical';
  confidence: number;           // Model confidence
  requiresSeniorReview: boolean;
}

// Policy Validation Response
interface PolicyValidation {
  compliant: boolean;           // Overall compliance
  checks: Record<string, PolicyCheck>;  // Individual checks
  violations: string[];         // Policy violations
  exceptionRequired: boolean;   // Needs approval
}

interface PolicyCheck {
  name: string;
  probability: number;          // 0-1 compliance probability
  passed: boolean;              // True if prob > threshold
}
```

### API Usage Patterns

**Single Decision**:
```typescript
const result = await typesafeService.classifyDocument(documentContent);
if (result.confidence > 0.85) {
    await applyClassification(result.docType);
} else {
    await flagForReview(result);
}
```

**Parallel Decisions**:
```typescript
const results = await typesafeService.batchDecisions({
    state: loanPackage,
    questions: {
        risk: "scoreLoanRisk",
        policy: "validatePolicy",
        readiness: "checkStageReadiness"
    }
});
```

**Confidence-Based Routing**:
```typescript
function routeWithConfidence(
    decision: Decision,
    highThreshold: number = 0.85,
    lowThreshold: number = 0.50
): string {
    if (decision.confidence > highThreshold) {
        return "auto_proceed";
    } else if (decision.confidence > lowThreshold) {
        return "flag_for_review";
    } else {
        return "escalate_to_human";
    }
}
```

---

## Performance Expectations

### Latency Improvements

| Operation | Current | With TypeSafe | Improvement |
|-----------|---------|---------------|-------------|
| Document classification | 2-3s | 0.3-0.5s | **6x faster** |
| Risk scoring | 5-8s | 0.5-0.8s | **10x faster** |
| Policy validation (4 checks) | 12-20s | 0.6-1.0s | **20x faster** |
| Intent routing | 2-4s | 0.2-0.4s | **10x faster** |
| **Full loan review** | 21-35s | 1.6-2.7s | **15x faster** |

### Cost Improvements

| Operation | Current Tokens | TypeSafe Tokens | Savings |
|-----------|---------------|-----------------|---------|
| Document classification | ~500 | ~150 | 70% |
| Risk scoring | ~1,500 | ~300 | 80% |
| Policy validation | ~800 | ~200 | 75% |
| Intent routing | ~400 | ~100 | 75% |
| **Total per loan** | ~3,200 | ~750 | **76% savings** |

### Confidence Distribution (Expected)

Based on TypeSafe documentation and similar use cases:
- **High confidence (>0.85)**: 70-80% of decisions → auto-process
- **Medium confidence (0.50-0.85)**: 15-20% → flag for review
- **Low confidence (<0.50)**: 5-10% → escalate to human

**Result**: 70-80% of decisions automated, 20-30% get human oversight

---

## Risk Mitigation

### Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| TypeSafe API unavailability | High | Fallback to Box AI + conversational AI |
| Lower accuracy than Box AI | Medium | A/B test and validate against historical data |
| Confidence scores unreliable | Medium | Set conservative thresholds initially, tune over time |
| Integration complexity | Low | Start with one operation, expand incrementally |
| Cost overruns from volume | Low | Monitor usage, set rate limits |

### Fallback Strategy

```typescript
async function classifyDocumentWithFallback(content: string): Promise<ClassificationResult> {
    try {
        // Try TypeSafe first (fast path)
        const result = await typesafeService.classifyDocument(content);
        if (result.confidence > MIN_CONFIDENCE) {
            return result;
        } else {
            // Low confidence - use Box AI
            return await boxAiClassify(content);
        }
    } catch (error) {
        if (error instanceof TypeSafeAPIError) {
            // TypeSafe unavailable - fallback to Box AI
            logger.warning("TypeSafe unavailable, using Box AI fallback");
            return await boxAiClassify(content);
        }
        throw error;
    }
}
```

### Testing Strategy

1. **Unit tests**: Mock TypeSafe API, test service logic
2. **Integration tests**: Real API calls against test data
3. **A/B testing**: Compare TypeSafe vs current method on same loans
4. **Historical validation**: Run against 100+ closed loans, compare results
5. **Performance benchmarks**: Measure latency and token usage
6. **Confidence calibration**: Validate that 0.85 confidence = 85% accuracy

---

## Demo Enhancements

### New Demo Beat: "TypeSafe Speed Run"

**Prompt**: "Process this loan application end-to-end using TypeSafe decisions"

**Show**:
1. Document classification (all 8 docs in <1s)
2. Risk scoring with confidence visualization
3. Parallel policy validation (4 checks simultaneously)
4. Automatic routing based on scores
5. **Side-by-side comparison**: Same operation with/without TypeSafe

**Visual**: Dashboard showing:
- TypeSafe decision tree
- Confidence scores for each decision
- Time saved vs traditional approach
- Auto-processed vs flagged-for-review breakdown

### Updated Storyboard Sections

**Beat 2 Enhancement**: "Find critical risk documents (TypeSafe-powered)"
- Show TypeSafe classifying all documents in parallel
- Display confidence scores
- Highlight auto-classified vs manual-review documents

**Beat 3 Enhancement**: "Extract & validate terms (TypeSafe policy checks)"
- Show parallel Noul questions for policy compliance
- Display probability bars for each check
- Show composite decision logic in action

**New Beat 2.5**: "Risk assessment dashboard"
- TypeSafe scores the loan across multiple dimensions
- Visual risk heatmap
- Confidence-based routing recommendation

---

## Success Metrics

### Phase 1-2 (Foundation + Document Classification)
- [ ] TypeSafe SDK integrated and functional
- [ ] Document classification accuracy ≥ Box AI baseline
- [ ] Average classification latency < 500ms
- [ ] Confidence calibration validated (0.85 → 85% accuracy)

### Phase 3-4 (Risk Scoring + Policy Validation)
- [ ] Risk scoring matches credit team expectations in blind test
- [ ] Policy validation catches 100% of historical violations
- [ ] End-to-end validation time < 1.5s (vs 15-20s baseline)

### Phase 5-6 (Intent Routing + Demo)
- [ ] Intent classification accuracy > 90%
- [ ] Demo showcases 10x+ speed improvement
- [ ] Documentation updated with TypeSafe patterns

### Phase 7 (Optimization)
- [ ] Full loan review < 3s end-to-end
- [ ] Token usage reduced by 75%+
- [ ] 70%+ decisions auto-processed with high confidence

---

## Next Steps

1. **Review this plan** - Validate approach with team
2. **Get TypeSafe API key** - Sign up at console.typesafe.ai
3. **Start Phase 1** - Install SDK and build wrapper service
4. **Pick pilot operation** - Recommend starting with document classification (highest ROI)
5. **Run parallel for 2 weeks** - TypeSafe + current method, compare results
6. **Iterate and expand** - Add operations incrementally based on success

---

## Questions for Decision

1. **Which operation should we pilot first?**
   - Recommendation: Document classification (fastest win, easiest validation)

2. **What confidence threshold for auto-processing?**
   - Recommendation: Start at 0.85, tune based on accuracy data

3. **Fallback strategy preferred?**
   - Option A: Always fall back to Box AI on low confidence
   - Option B: Route to human review immediately
   - Recommendation: Option A for non-critical, Option B for high-stakes decisions

4. **Integration timeline?**
   - Aggressive: 3-4 weeks (full integration)
   - Moderate: 6 weeks (phased rollout)
   - Conservative: 8+ weeks (extensive testing)
   - Recommendation: Moderate (6 weeks) for production quality

---

## Appendices

### A. TypeSafe Question Examples

See `docs/typesafe-examples.md` for complete question library covering:
- 15 document types
- 4 risk dimensions
- 8 policy checks
- 7 intent categories

### B. Confidence Calibration Data

See `docs/typesafe-calibration.md` for historical accuracy vs confidence analysis

### C. Cost Analysis Spreadsheet

See `docs/typesafe-cost-model.xlsx` for detailed cost projections

### D. Integration Checklist

See `docs/typesafe-integration-checklist.md` for step-by-step deployment guide
