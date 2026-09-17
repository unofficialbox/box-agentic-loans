# TypeSafe.ai Integration - Execution Plan

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
```python
# Get data from both systems via MCP
loan_record = salesforce_mcp.get_loan("LN-2026-0042")
term_sheet_doc = box_mcp.get_file(term_sheet_id)

# TypeSafe evaluates consistency
response = typesafe.system_one(
    state={
        "salesforce_record": {
            "amount": loan_record["Loan_Amount__c"],
            "rate": loan_record["Interest_Rate__c"],
            "ltv": loan_record["LTV__c"],
            "term": loan_record["Term_Months__c"]
        },
        "box_document": term_sheet_doc.content
    },
    questions={
        "amount_matches": Noul(
            instructions="Does the loan amount in the Salesforce record match the amount stated in the Box document?"
        ),
        "rate_matches": Noul(
            instructions="Does the interest rate in the Salesforce record match the rate in the Box document?"
        ),
        "terms_consistent": Noul(
            instructions="Are the loan terms in Salesforce and Box internally consistent and complete?"
        ),
        "discrepancy_severity": Score(
            instructions="If inconsistencies exist, how severe are they?",
            criteria=[
                "Minor: Small formatting differences, no material impact",
                "Moderate: Numbers differ slightly, requires review",
                "Major: Material differences in key terms",
                "Critical: Fundamental mismatch, blocks closing"
            ]
        )
    }
)

# Act based on cross-system intelligence
if all([
    response.answers["amount_matches"].noul > 0.95,
    response.answers["rate_matches"].noul > 0.95,
    response.answers["terms_consistent"].noul > 0.95
]):
    approve_for_closing()
elif response.answers["discrepancy_severity"].score > 2.0:
    escalate_critical_mismatch()
else:
    flag_for_reconciliation()
```

**Why This Is Fancy**: Neither Box nor Salesforce can validate their own data against the other. TypeSafe reads from both (via MCPs) and makes consistency judgments impossible for either system alone.

### 2. Portfolio Risk Intelligence

**Problem**: Risk patterns across loans are invisible when analyzing one loan at a time.

**TypeSafe Solution**:
```python
# Get portfolio data from Salesforce MCP
active_loans = salesforce_mcp.list_loans(status="Underwriting,Approved")

# Get document quality scores from Box MCP for each loan
loan_packages = [box_mcp.get_loan_package(loan.id) for loan in active_loans]

# TypeSafe evaluates portfolio-level patterns
response = typesafe.system_one(
    state={
        "portfolio": [
            {
                "loan_id": loan.id,
                "borrower": loan.borrower,
                "amount": loan.amount,
                "ltv": loan.ltv,
                "dscr": loan.dscr,
                "risk_rating": loan.risk_rating,
                "document_count": len(package.documents),
                "document_types": [doc.type for doc in package.documents]
            }
            for loan, package in zip(active_loans, loan_packages)
        ]
    },
    questions={
        "concentration_risk": Score(
            instructions="Assess borrower/industry concentration risk",
            criteria=[
                "Low: Well-diversified portfolio",
                "Moderate: Some concentration in borrower/industry",
                "High: Heavy concentration, limited diversity",
                "Critical: Excessive concentration, systemic risk"
            ]
        ),
        "documentation_quality_trend": Score(
            instructions="Overall trend in documentation completeness",
            criteria=[
                "Improving: Recent loans better documented",
                "Stable: Consistent documentation quality",
                "Declining: Recent loans less complete",
                "Poor: Widespread documentation gaps"
            ]
        ),
        "outlier_loans": Choice(
            instructions="Which loans are statistical outliers requiring attention?",
            criteria={loan.id: f"{loan.borrower} ${loan.amount:,}" for loan in active_loans}
        ),
        "portfolio_health": Score(
            instructions="Overall portfolio health assessment",
            criteria=["Excellent", "Good", "Fair", "Poor", "Critical"]
        )
    }
)

# Generate portfolio risk report
if response.answers["portfolio_health"].score > 3.0:
    alert_portfolio_management()
if response.answers["concentration_risk"].score > 2.0:
    recommend_diversification()
highlight_outliers(response.answers["outlier_loans"].choice)
```

**Why This Is Fancy**: Combines Salesforce loan records + Box document inventories to detect portfolio-level patterns neither system can see independently.

### 3. Intelligent Document Assembly

**Problem**: Different loan types need different commitment letter sections, but template selection is manual.

**TypeSafe Solution**:
```python
# Get loan data from Salesforce MCP
loan = salesforce_mcp.get_loan(loan_id)

# Get available DocGen templates from Box MCP
templates = box_mcp.list_docgen_templates()

# Get borrower communication history from Salesforce MCP
communications = salesforce_mcp.get_account_timeline(loan.borrower_account_id)

# TypeSafe orchestrates intelligent assembly
response = typesafe.system_one(
    state={
        "loan_type": loan.loan_type,
        "loan_amount": loan.amount,
        "borrower_sophistication": communications,
        "special_conditions": loan.underwriting_notes
    },
    questions={
        "template_base": Choice(
            instructions="Which commitment letter template best fits this loan?",
            criteria={
                t.id: f"{t.name}: {t.description}" for t in templates
            }
        ),
        "include_ltv_covenant": Noul(
            instructions="Should the letter include detailed LTV covenant language?"
        ),
        "include_guaranty_detail": Noul(
            instructions="Should the letter include detailed personal guaranty terms?"
        ),
        "include_collateral_schedule": Noul(
            instructions="Should the letter include a detailed collateral schedule?"
        ),
        "tone": Score(
            instructions="What tone should the letter take?",
            criteria=[
                "Simple: Plain language, minimal jargon",
                "Standard: Professional but accessible",
                "Technical: Detailed legal language",
                "Complex: Highly technical with full detail"
            ]
        )
    }
)

# Assemble document via Box MCP with TypeSafe-selected components
template_id = response.answers["template_base"].choice
sections = {
    "include_ltv": response.answers["include_ltv_covenant"].noul > 0.7,
    "include_guaranty": response.answers["include_guaranty_detail"].noul > 0.7,
    "include_collateral": response.answers["include_collateral_schedule"].noul > 0.7,
    "complexity_level": int(response.answers["tone"].score)
}

# Box MCP generates with intelligent section selection
box_mcp.create_docgen_batch(template_id, loan_data, sections)
```

**Why This Is Fancy**: Combines loan attributes (SF) + templates (Box) + borrower communication history (SF) to intelligently customize document generation beyond simple merge fields.

### 4. Borrower Communication Intelligence

**Problem**: Loan officers need to prioritize responses based on urgency/risk, but email/portal messages are unstructured.

**TypeSafe Solution**:
```python
# Get borrower communication from Salesforce MCP (could be email, portal message, etc)
message = salesforce_mcp.get_latest_borrower_message(loan_id)

# Get loan status from Salesforce MCP
loan = salesforce_mcp.get_loan(loan_id)

# Get recent document activity from Box MCP
recent_docs = box_mcp.query_metadata(
    template="losDocument",
    query=f"loanReference='{loan.loan_id}' AND modifiedAfter='-7 days'"
)

# TypeSafe analyzes communication in context
response = typesafe.system_one(
    state={
        "message": message.content,
        "loan_status": loan.status,
        "loan_amount": loan.amount,
        "closing_date": loan.target_closing_date,
        "recent_activity": [{"doc": d.name, "date": d.modified} for d in recent_docs]
    },
    questions={
        "urgency": Score(
            instructions="How urgent is this communication?",
            criteria=[
                "Routine: Standard update, no time pressure",
                "Important: Needs response in 1-2 days",
                "Urgent: Needs response today",
                "Critical: Immediate attention, blocks closing"
            ]
        ),
        "sentiment": Score(
            instructions="Borrower sentiment",
            criteria=["Positive", "Neutral", "Concerned", "Frustrated", "Angry"]
        ),
        "request_type": Choice(
            instructions="What is the borrower asking for?",
            criteria={
                "status_update": "Wants progress update",
                "document_issue": "Problem with documents",
                "term_clarification": "Questions about loan terms",
                "timeline_concern": "Worried about closing timeline",
                "new_information": "Providing new financial info",
                "complaint": "Expressing dissatisfaction"
            }
        ),
        "risk_to_deal": Noul(
            instructions="Does this message indicate risk to deal closure?"
        ),
        "requires_escalation": Noul(
            instructions="Should this be escalated beyond the loan officer?"
        )
    }
)

# Intelligent routing based on cross-system context
if response.answers["urgency"].score >= 2.5 or response.answers["risk_to_deal"].noul > 0.7:
    priority_flag(message, "High")
    if response.answers["requires_escalation"].noul > 0.6:
        escalate_to_manager()
    
if response.answers["sentiment"].score >= 3.0:  # Frustrated or angry
    assign_to_senior_loan_officer()
    
# Suggest response based on request type + context
suggest_response_template(
    request_type=response.answers["request_type"].choice,
    urgency=response.answers["urgency"].score,
    include_status_details=len(recent_docs) > 0
)
```

**Why This Is Fancy**: Analyzes borrower communication in the context of loan status (SF) + recent document activity (Box) to provide intelligent triage and response suggestions.

### 5. Predictive Loan Outcome Modeling

**Problem**: Want to predict whether a loan will close successfully based on early indicators.

**TypeSafe Solution**:
```python
# Get current loan from Salesforce MCP
current_loan = salesforce_mcp.get_loan(loan_id)

# Get document package from Box MCP
docs = box_mcp.get_loan_package(loan_id)

# Get historical closed loans from Salesforce MCP
historical_loans = salesforce_mcp.list_loans(status="Closed", limit=100)

# Get their document patterns from Box MCP
historical_patterns = [
    {
        "loan": loan,
        "doc_count_at_30_days": box_mcp.count_docs_as_of(loan.id, days_since_app=30),
        "classification_rate": box_mcp.get_classification_rate(loan.id),
        "revision_count": box_mcp.get_avg_revisions(loan.id)
    }
    for loan in historical_loans
]

# Calculate current loan's position
days_since_app = (date.today() - current_loan.created_date).days
current_doc_count = len(docs.files)
current_classification_rate = sum(1 for d in docs.files if d.classified) / len(docs.files)

# TypeSafe predicts outcome based on patterns
response = typesafe.system_one(
    state={
        "current_loan": {
            "days_since_app": days_since_app,
            "doc_count": current_doc_count,
            "classification_rate": current_classification_rate,
            "ltv": current_loan.ltv,
            "amount": current_loan.amount
        },
        "historical_successful": [
            p for p in historical_patterns 
            if p["loan"].closed_successfully
        ],
        "historical_failed": [
            p for p in historical_patterns 
            if not p["loan"].closed_successfully
        ]
    },
    questions={
        "likely_outcome": Choice(
            instructions="Based on current progress vs historical patterns, what is the likely outcome?",
            criteria={
                "on_track": "Progressing normally, likely to close",
                "at_risk": "Falling behind benchmarks, needs attention",
                "unlikely": "Significantly behind, unlikely to close without intervention"
            }
        },
        "completion_probability": Noul(
            instructions="Will this loan close successfully?"
        ),
        "days_to_close": Score(
            instructions="Estimated days until closing",
            criteria=["0-30 days", "31-60 days", "61-90 days", "90+ days", "Won't close"]
        ),
        "recommended_action": Choice(
            instructions="What should the loan officer do?",
            criteria={
                "continue": "Continue standard process",
                "expedite": "Expedite document collection",
                "intervene": "Direct intervention needed",
                "escalate": "Escalate to management"
            }
        )
    }
)

# Act on prediction
if response.answers["completion_probability"].noul < 0.5:
    alert_loan_officer(
        "Loan at risk of not closing",
        recommended_action=response.answers["recommended_action"].choice,
        confidence=response.answers["likely_outcome"].confidence
    )
```

**Why This Is Fancy**: Combines current loan status (SF) + current document progress (Box) + historical loan outcomes (SF) + historical document patterns (Box) to predict outcomes - impossible for either system alone.

### 6. Anomaly Detection in Document Sets

**Problem**: Unusual document patterns can indicate fraud, errors, or process issues, but no system tracks cross-document patterns.

**TypeSafe Solution**:
```python
# Get all loan documents from Box MCP
loan_docs = box_mcp.get_loan_package(loan_id)

# Get loan metadata from Salesforce MCP
loan = salesforce_mcp.get_loan(loan_id)

# Get typical document patterns for similar loans
similar_loans = salesforce_mcp.list_loans(
    loan_type=loan.loan_type,
    amount_range=(loan.amount * 0.8, loan.amount * 1.2),
    status="Closed"
)
typical_patterns = [box_mcp.get_loan_package(l.id) for l in similar_loans]

# TypeSafe detects anomalies
response = typesafe.system_one(
    state={
        "current_loan_docs": [
            {
                "type": doc.document_type,
                "size": doc.size,
                "pages": doc.page_count,
                "modified_count": doc.version_count,
                "upload_time": doc.created_at
            }
            for doc in loan_docs.files
        ],
        "typical_patterns": [
            {
                "doc_count": len(pkg.files),
                "doc_types": [d.document_type for d in pkg.files],
                "avg_revisions": sum(d.version_count for d in pkg.files) / len(pkg.files)
            }
            for pkg in typical_patterns
        ]
    },
    questions={
        "missing_docs": Choice(
            instructions="Which critical document types are missing?",
            criteria={
                "none": "All expected documents present",
                "financial": "Missing financial statements",
                "appraisal": "Missing appraisal",
                "tax": "Missing tax returns",
                "insurance": "Missing insurance docs"
            }
        ),
        "unusual_revision_count": Noul(
            instructions="Does this loan have an unusually high number of document revisions?"
        ),
        "upload_timing_anomaly": Noul(
            instructions="Were documents uploaded in an unusual pattern (e.g., all at once, or unusual gaps)?"
        ),
        "duplicate_risk": Score(
            instructions="Risk of duplicate or contradictory documents",
            criteria=["No risk", "Low risk", "Moderate risk", "High risk", "Confirmed duplicates"]
        ),
        "fraud_indicators": Score(
            instructions="Overall fraud risk indicators",
            criteria=[
                "None: Normal documentation pattern",
                "Low: Minor inconsistencies",
                "Moderate: Multiple red flags",
                "High: Significant fraud indicators",
                "Critical: Clear fraud pattern"
            ]
        )
    }
)

# Alert on anomalies
if response.answers["fraud_indicators"].score > 2.0:
    flag_for_fraud_review(
        loan_id,
        indicators={
            "missing": response.answers["missing_docs"].choice,
            "unusual_revisions": response.answers["unusual_revision_count"].noul,
            "timing_anomaly": response.answers["upload_timing_anomaly"].noul,
            "duplicates": response.answers["duplicate_risk"].score
        }
    )
```

**Why This Is Fancy**: Detects patterns across the entire document set by comparing current loan (Box + SF) against historical patterns (Box + SF) to identify anomalies neither system can see independently.

---

## TypeSafe Integration Opportunities

### 1. Document Classification (Choice)

**Current**: `LosClassifyDocument` → Box AI Extract → parse result → apply metadata

**With TypeSafe**:
```python
response = client.system_one(
    state=document_content,
    questions={
        "doc_type": Choice(
            instructions="Classify this loan document",
            criteria={
                "loan_application": "Completed loan application form",
                "term_sheet": "Proposed loan terms and conditions",
                "financial_statement": "Balance sheet, P&L, cash flow",
                "tax_return": "Business or personal tax returns",
                "appraisal": "Property valuation report",
                "insurance": "Insurance policy or certificate",
                "credit_memo": "Internal credit analysis",
                "commitment_letter": "Bank's loan approval offer",
                "executed_agreement": "Signed loan documents"
            }
        )
    }
)

doc_type = response.answers["doc_type"].choice
confidence = response.answers["doc_type"].confidence

if confidence > 0.85:
    apply_metadata_automatically(doc_type)
else:
    flag_for_manual_classification(doc_type, confidence)
```

**Benefits**:
- 2-3x faster (single API call vs Box AI pipeline)
- Confidence-based routing (auto-classify high confidence, review low)
- Consistent enum values (no fuzzy matching)

### 2. Loan Risk Scoring (Score)

**Current**: Conversational AI analyzes loan, returns free-form risk assessment

**With TypeSafe**:
```python
response = client.system_one(
    state=loan_terms_and_financials,
    questions={
        "credit_risk": Score(
            instructions="Assess overall credit risk",
            criteria=[
                "Low risk: Strong financials, conservative leverage, proven track record",
                "Medium risk: Adequate financials, moderate leverage, some operational concerns",
                "High risk: Weak financials, aggressive leverage, significant credit issues",
                "Critical risk: Severe financial distress, policy violations, immediate concerns"
            ]
        ),
        "collateral_adequacy": Score(
            instructions="Evaluate collateral coverage",
            criteria=[
                "Excellent: LTV <60%, high-quality assets, strong liquidation value",
                "Good: LTV 60-75%, standard assets, adequate liquidation value",
                "Fair: LTV 75-85%, weaker assets, limited liquidation value",
                "Poor: LTV >85%, weak assets, questionable liquidation value"
            ]
        )
    }
)

credit_score = response.answers["credit_risk"].score
collateral_score = response.answers["collateral_adequacy"].score

# Composite risk rating with code-controlled weights
composite_risk = (credit_score * 0.7) + (collateral_score * 0.3)

if composite_risk > 2.5:
    flag_for_senior_review()
elif composite_risk > 1.5:
    assign_to_experienced_underwriter()
else:
    proceed_with_standard_underwriting()
```

**Benefits**:
- Numeric scores enable programmatic routing
- Confidence scores show model certainty
- Fast (sub-second) vs multi-second AI analysis
- Probabilities reveal uncertainty distribution

### 3. Credit Policy Validation (Noul)

**Current**: Box Hub QA asks policy library, parse yes/no answer

**With TypeSafe**:
```python
response = client.system_one(
    state={
        "loan_terms": loan_terms,
        "credit_policy": credit_policy_document
    },
    questions={
        "ltv_compliant": Noul(
            instructions="Does the LTV ratio comply with credit policy limits?"
        ),
        "dscr_compliant": Noul(
            instructions="Does the DSCR meet or exceed policy minimums?"
        ),
        "collateral_acceptable": Noul(
            instructions="Is the collateral type approved under policy?"
        ),
        "guaranty_adequate": Noul(
            instructions="Does the personal guaranty meet policy requirements?"
        )
    }
)

# Get probability of each compliance check
ltv_prob = response.answers["ltv_compliant"].noul
dscr_prob = response.answers["dscr_compliant"].noul
collateral_prob = response.answers["collateral_acceptable"].noul
guaranty_prob = response.answers["guaranty_adequate"].noul

# Fail if any check has <50% probability of compliance
policy_violations = []
if ltv_prob < 0.5:
    policy_violations.append(f"LTV non-compliant (confidence: {ltv_prob:.1%})")
if dscr_prob < 0.5:
    policy_violations.append(f"DSCR non-compliant (confidence: {dscr_prob:.1%})")
if collateral_prob < 0.5:
    policy_violations.append(f"Collateral not acceptable (confidence: {collateral_prob:.1%})")
if guaranty_prob < 0.5:
    policy_violations.append(f"Guaranty inadequate (confidence: {guaranty_prob:.1%})")

if policy_violations:
    require_exception_approval(policy_violations)
```

**Benefits**:
- Parallel evaluation (all checks in one request)
- Probabilistic thresholds (not just binary yes/no)
- Faster than sequential Hub QA calls
- Atomic decisions composable in code

### 4. Intent Routing (Choice)

**Current**: LLM prompt engineering to classify user intent

**With TypeSafe**:
```python
response = client.system_one(
    state=user_query,
    questions={
        "intent": Choice(
            instructions="What is the user trying to accomplish?",
            criteria={
                "search_documents": "Find or search for loan documents",
                "extract_terms": "Extract loan terms from documents",
                "validate_policy": "Check compliance with credit policy",
                "generate_letter": "Create commitment or other letter",
                "prepare_signature": "Send documents for signing",
                "review_history": "Compare with prior loans or analyze history",
                "update_record": "Modify loan record fields"
            }
        )
    }
)

intent = response.answers["intent"].choice
confidence = response.answers["intent"].confidence

# Route to appropriate connector based on intent
if confidence > 0.8:
    if intent == "search_documents":
        call_box_metadata_search()
    elif intent == "extract_terms":
        call_los_extract_loan_terms()
    elif intent == "validate_policy":
        call_typesafe_policy_validation()
    # ... etc
else:
    # Low confidence - route to conversational AI for clarification
    call_conversational_ai_for_disambiguation()
```

**Benefits**:
- Single-shot classification vs multi-turn conversation
- Confidence-based fallback to conversational AI
- Deterministic routing logic
- Fast intent detection (sub-second)

### 5. Batch Decision Making (Speculative Fan-Out)

**TypeSafe Pattern**: Send all possible questions in one request, decide in code which to act on

```python
response = client.system_one(
    state=loan_package,
    questions={
        # Classification
        "doc_types": {f"doc_{i}": Choice(...) for i, doc in enumerate(documents)},
        
        # Risk assessment
        "credit_risk": Score(...),
        "collateral_risk": Score(...),
        
        # Policy checks
        "ltv_ok": Noul(...),
        "dscr_ok": Noul(...),
        "collateral_ok": Noul(...),
        
        # Readiness gates
        "ready_for_underwriting": Noul(...),
        "ready_for_approval": Noul(...),
        "ready_for_closing": Noul(...)
    }
)

# All answers returned in single response - decide in code what to do
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

**New Component**: `TypeSafeDecisionService`

Located: `los-salesforce-project/services/typesafe_service.py`

```python
class TypeSafeDecisionService:
    """
    Wraps TypeSafe API for loan decision operations.
    Provides confidence-based routing and structured decision outputs.
    """
    
    def __init__(self, api_key: str):
        self.client = TypeSafeClient(api_key=api_key)
    
    def classify_document(self, content: str) -> DocumentClassification:
        """Returns document type with confidence."""
        
    def score_loan_risk(self, loan_data: dict) -> RiskScore:
        """Returns composite risk score with subscores."""
        
    def validate_policy(self, loan_terms: dict, policy: str) -> PolicyValidation:
        """Returns compliance checks with probabilities."""
        
    def route_intent(self, query: str) -> Intent:
        """Returns user intent with confidence."""
        
    def batch_decisions(self, state: dict, questions: dict) -> BatchDecisions:
        """Handles complex multi-decision scenarios."""
```

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

### Python Dependencies

Add to `requirements.txt`:
```
typesafe-sdk>=1.0.0
```

### Service Interface

```python
# Document Classification Response
@dataclass
class DocumentClassification:
    doc_type: str              # Selected type
    confidence: float          # 0-1 confidence score
    probabilities: Dict[str, float]  # All type probabilities
    needs_review: bool         # True if confidence < threshold

# Risk Score Response
@dataclass
class RiskScore:
    credit_score: float        # 0-3 weighted score
    collateral_score: float    # 0-3 weighted score
    composite_score: float     # Weighted combination
    risk_level: str           # Low/Medium/High/Critical
    confidence: float         # Model confidence
    requires_senior_review: bool

# Policy Validation Response
@dataclass
class PolicyValidation:
    compliant: bool           # Overall compliance
    checks: Dict[str, PolicyCheck]  # Individual checks
    violations: List[str]     # Policy violations
    exception_required: bool  # Needs approval
    
@dataclass
class PolicyCheck:
    name: str
    probability: float        # 0-1 compliance probability
    passed: bool             # True if prob > threshold
```

### API Usage Patterns

**Single Decision**:
```python
result = typesafe_service.classify_document(document_content)
if result.confidence > 0.85:
    apply_classification(result.doc_type)
else:
    flag_for_review(result)
```

**Parallel Decisions**:
```python
results = typesafe_service.batch_decisions(
    state=loan_package,
    questions={
        "risk": "score_loan_risk",
        "policy": "validate_policy",
        "readiness": "check_stage_readiness"
    }
)
```

**Confidence-Based Routing**:
```python
def route_with_confidence(decision, high_threshold=0.85, low_threshold=0.50):
    if decision.confidence > high_threshold:
        return "auto_proceed"
    elif decision.confidence > low_threshold:
        return "flag_for_review"
    else:
        return "escalate_to_human"
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

```python
def classify_document_with_fallback(content):
    try:
        # Try TypeSafe first (fast path)
        result = typesafe_service.classify_document(content)
        if result.confidence > MIN_CONFIDENCE:
            return result
        else:
            # Low confidence - use Box AI
            return box_ai_classify(content)
    except TypeSafeAPIError:
        # TypeSafe unavailable - fallback to Box AI
        logger.warning("TypeSafe unavailable, using Box AI fallback")
        return box_ai_classify(content)
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
