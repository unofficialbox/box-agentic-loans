#!/bin/bash
# Real Demo Flow Benchmark
# Measures each Q&A turn from the actual demo clickpath

set -e

TYPESAFE_KEY="${TYPESAFE_API_KEY:-apikey_2177853eb42e0d54c2cb5f148d156e5ea34_2a371a210e195002e696ff68282229e4338a27f384d84a9b8ba75342e748ea0d}"

echo ""
echo "🎬 Demo Flow Performance Benchmark"
echo "   Following: DEMO-CLICKPATH.md"
echo ""
echo "Measuring each Q&A turn with TypeSafe orchestration..."
echo ""

# Beat 2: Find Critical Risk Documents
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📊 Beat 2: Find Critical Risk Documents"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Prompt: \"What's the latest loan for Harborview Logistics?"
echo "         Which documents in that loan are flagged critical policy risk?\""
echo ""

# Turn 1: Route intent + find loan
echo "Turn 1: Route intent → find loan"
START=$(date +%s%N)
RESULT=$(curl -s -X POST https://api.typesafe.ai/v1/systemone \
  -H "Authorization: Bearer $TYPESAFE_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "state": "Find the latest loan for Harborview Logistics and identify critical risk documents",
    "model": "jev-latest",
    "questions": {
      "primary_intent": {
        "type": "choice",
        "instructions": "What is the primary operation?",
        "criteria": {
          "search_documents": "Search for documents by criteria",
          "list_loans": "Find loans by borrower",
          "both": "Need to find loan first, then search documents"
        }
      },
      "needs_metadata_filter": {
        "type": "noul",
        "instructions": "Should we filter by policyRisk metadata?"
      }
    }
  }')
END=$(date +%s%N)
TIME=$(( ($END - $START) / 1000000 ))
TOKENS=$(echo "$RESULT" | jq '(.usage.input_tokens // 0) + (.usage.output_tokens // 0)')
INTENT=$(echo "$RESULT" | jq -r '.answers.primary_intent.choice')
CONFIDENCE=$(echo "$RESULT" | jq -r '.answers.primary_intent.confidence')

echo "  Time: ${TIME}ms"
echo "  Tokens: $TOKENS"
echo "  Decision: $INTENT (confidence: $CONFIDENCE)"
echo "  Action: Call listLoans(borrower='Harborview') → query_metadata(policyRisk='Critical')"
echo ""

BEAT2_TOTAL=$TIME

# Beat 3: Extract & Validate Terms
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📊 Beat 3: Extract & Validate Terms"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Turn 1: Extract terms and validate policy
echo "Turn 1: \"Extract loan terms from the marked-up term sheet"
echo "         for that loan and check them against credit policy.\""
echo ""
START=$(date +%s%N)
RESULT=$(curl -s -X POST https://api.typesafe.ai/v1/systemone \
  -H "Authorization: Bearer $TYPESAFE_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "state": {
      "termSheet": {
        "loanAmount": 4800000,
        "interestRate": 7.25,
        "ltv": 0.85,
        "dscr": 1.12,
        "term": 84
      },
      "policy": {
        "maxLtv": 0.80,
        "minDscr": 1.25
      }
    },
    "model": "jev-latest",
    "questions": {
      "ltv_compliant": {
        "type": "noul",
        "instructions": "Does LTV comply with policy max of 80%?"
      },
      "dscr_compliant": {
        "type": "noul",
        "instructions": "Does DSCR meet policy minimum of 1.25x?"
      },
      "overall_risk": {
        "type": "score",
        "instructions": "Overall policy compliance risk",
        "criteria": ["Low: Full compliance", "Medium: Minor variances", "High: Major variances", "Critical: Multiple violations"]
      }
    }
  }')
END=$(date +%s%N)
TIME=$(( ($END - $START) / 1000000 ))
TOKENS=$(echo "$RESULT" | jq '(.usage.input_tokens // 0) + (.usage.output_tokens // 0)')
LTV_PROB=$(echo "$RESULT" | jq -r '.answers.ltv_compliant.noul')
DSCR_PROB=$(echo "$RESULT" | jq -r '.answers.dscr_compliant.noul')
RISK=$(echo "$RESULT" | jq -r '.answers.overall_risk.score')

echo "  Time: ${TIME}ms"
echo "  Tokens: $TOKENS"
echo "  Results:"
echo "    LTV compliant: $LTV_PROB (85% > 80% policy max)"
echo "    DSCR compliant: $DSCR_PROB (1.12x < 1.25x policy min)"
echo "    Risk score: $RISK"
echo "  Action: Call extractLoanTerms() → validate against policy Hub"
echo ""

BEAT3_TURN1=$TIME

# Turn 2: Validate against Salesforce record
echo "Turn 2: \"Validate those terms against the Salesforce record.\""
echo ""
START=$(date +%s%N)
RESULT=$(curl -s -X POST https://api.typesafe.ai/v1/systemone \
  -H "Authorization: Bearer $TYPESAFE_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "state": {
      "extracted_terms": {
        "amount": 4800000,
        "rate": 7.25,
        "ltv": 0.85
      },
      "salesforce_record": {
        "amount": 4800000,
        "rate": 7.25,
        "ltv": 0.85
      }
    },
    "model": "jev-latest",
    "questions": {
      "amount_matches": {
        "type": "noul",
        "instructions": "Does amount match between document and record?"
      },
      "rate_matches": {
        "type": "noul",
        "instructions": "Does rate match between document and record?"
      },
      "ltv_matches": {
        "type": "noul",
        "instructions": "Does LTV match between document and record?"
      },
      "consistency_confidence": {
        "type": "score",
        "instructions": "Overall data consistency confidence",
        "criteria": ["Perfect match", "Minor differences", "Significant discrepancies", "Major conflicts"]
      }
    }
  }')
END=$(date +%s%N)
TIME=$(( ($END - $START) / 1000000 ))
TOKENS=$(echo "$RESULT" | jq '(.usage.input_tokens // 0) + (.usage.output_tokens // 0)')
CONSISTENCY=$(echo "$RESULT" | jq -r '.answers.consistency_confidence.score')

echo "  Time: ${TIME}ms"
echo "  Tokens: $TOKENS"
echo "  Consistency: $CONSISTENCY (0=perfect, 3=major conflicts)"
echo "  Action: Cross-system validation (Box ↔ Salesforce)"
echo ""

BEAT3_TURN2=$TIME

# Turn 3: Apply terms to record
echo "Turn 3: \"apply the amount, rate and term to the record, confirm\""
echo ""
START=$(date +%s%N)
RESULT=$(curl -s -X POST https://api.typesafe.ai/v1/systemone \
  -H "Authorization: Bearer $TYPESAFE_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "state": {
      "action": "apply terms to Salesforce record",
      "terms_validated": true,
      "policy_exceptions": ["LTV", "DSCR"]
    },
    "model": "jev-latest",
    "questions": {
      "requires_exception": {
        "type": "noul",
        "instructions": "Do policy exceptions require approval?"
      },
      "safe_to_apply": {
        "type": "noul",
        "instructions": "Is it safe to write these terms to the record?"
      }
    }
  }')
END=$(date +%s%N)
TIME=$(( ($END - $START) / 1000000 ))
TOKENS=$(echo "$RESULT" | jq '(.usage.input_tokens // 0) + (.usage.output_tokens // 0)')

echo "  Time: ${TIME}ms"
echo "  Tokens: $TOKENS"
echo "  Action: Call applyLoanTerms(confirmed=true)"
echo ""

BEAT3_TURN3=$TIME
BEAT3_TOTAL=$(( $BEAT3_TURN1 + $BEAT3_TURN2 + $BEAT3_TURN3 ))

# Beat 4: Compare Loan History
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📊 Beat 4: Compare Loan History"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Prompt: \"Compare the covenant terms across Harborview's"
echo "         prior executed loans and this 2026 markup.\""
echo ""

START=$(date +%s%N)
RESULT=$(curl -s -X POST https://api.typesafe.ai/v1/systemone \
  -H "Authorization: Bearer $TYPESAFE_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "state": {
      "current_loan": {
        "id": "LN-2026-0042",
        "amount": 4800000,
        "ltv": 0.85,
        "dscr": 1.12
      },
      "historical_loans": [
        {"id": "LN-2023-0311", "amount": 3200000, "ltv": 0.70, "dscr": 1.30},
        {"id": "LN-2025-0148", "amount": 2800000, "ltv": 0.68, "dscr": 1.35}
      ]
    },
    "model": "jev-latest",
    "questions": {
      "ltv_trend": {
        "type": "score",
        "instructions": "LTV trend analysis",
        "criteria": ["Improving: Lower LTV", "Stable: Similar LTV", "Weakening: Higher LTV", "Concerning: Significantly higher"]
      },
      "dscr_trend": {
        "type": "score",
        "instructions": "DSCR trend analysis",
        "criteria": ["Improving: Higher DSCR", "Stable: Similar DSCR", "Weakening: Lower DSCR", "Concerning: Significantly lower"]
      },
      "portfolio_risk": {
        "type": "score",
        "instructions": "Overall portfolio risk for this borrower",
        "criteria": ["Low: Consistent conservative terms", "Medium: Some leverage increase", "High: Significant deterioration", "Critical: Multiple red flags"]
      }
    }
  }')
END=$(date +%s%N)
TIME=$(( ($END - $START) / 1000000 ))
TOKENS=$(echo "$RESULT" | jq '(.usage.input_tokens // 0) + (.usage.output_tokens // 0)')
PORTFOLIO_RISK=$(echo "$RESULT" | jq -r '.answers.portfolio_risk.score')

echo "  Time: ${TIME}ms"
echo "  Tokens: $TOKENS"
echo "  Portfolio Risk: $PORTFOLIO_RISK"
echo "  Action: Call listLoans(borrower, status='Closed') → compare terms"
echo ""

BEAT4_TOTAL=$TIME

# Beat 5: Generate & Send for Signature
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📊 Beat 5: Generate & Send for Signature"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Prompt: \"Generate the commitment letter for this loan and"
echo "         send it for signature using the confirmed signer.\""
echo ""

# Turn 1: Select template and validate state
START=$(date +%s%N)
RESULT=$(curl -s -X POST https://api.typesafe.ai/v1/systemone \
  -H "Authorization: Bearer $TYPESAFE_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "state": {
      "loan": {
        "type": "Commercial Real Estate",
        "amount": 4800000,
        "borrower": "Harborview Logistics",
        "status": "Approved"
      },
      "borrower_sophistication": "experienced commercial borrower"
    },
    "model": "jev-latest",
    "questions": {
      "template_complexity": {
        "type": "score",
        "instructions": "What template complexity level?",
        "criteria": ["Simple: Plain language", "Standard: Professional", "Technical: Detailed legal", "Complex: Highly technical"]
      },
      "include_ltv_detail": {
        "type": "noul",
        "instructions": "Include detailed LTV covenant section?"
      },
      "ready_for_signature": {
        "type": "noul",
        "instructions": "Is loan status appropriate for signature request?"
      }
    }
  }')
END=$(date +%s%N)
TIME=$(( ($END - $START) / 1000000 ))
TOKENS=$(echo "$RESULT" | jq '(.usage.input_tokens // 0) + (.usage.output_tokens // 0)')
READY=$(echo "$RESULT" | jq -r '.answers.ready_for_signature.noul')

echo "  Time: ${TIME}ms"
echo "  Tokens: $TOKENS"
echo "  Ready for signature: $READY"
echo "  Action: Call create_docgen_batch() → prepareSignatureRequest()"
echo ""

BEAT5_TOTAL=$TIME

# Summary
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📈 Demo Flow Summary"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "TypeSafe Orchestration Times:"
echo ""
echo "  Beat 2 (Find Critical Risk):    ${BEAT2_TOTAL}ms"
echo "  Beat 3 (Extract & Validate):    ${BEAT3_TOTAL}ms"
echo "    ├─ Turn 1 (Extract + Policy): ${BEAT3_TURN1}ms"
echo "    ├─ Turn 2 (Validate Record):  ${BEAT3_TURN2}ms"
echo "    └─ Turn 3 (Apply Terms):      ${BEAT3_TURN3}ms"
echo "  Beat 4 (Compare History):       ${BEAT4_TOTAL}ms"
echo "  Beat 5 (Generate & Sign):       ${BEAT5_TOTAL}ms"
echo ""
TOTAL=$(( $BEAT2_TOTAL + $BEAT3_TOTAL + $BEAT4_TOTAL + $BEAT5_TOTAL ))
echo "  Total Demo Time:                ${TOTAL}ms (~$(( $TOTAL / 1000 )) seconds)"
echo ""
echo "Note: These are TypeSafe orchestration decision times only."
echo "      Add MCP call times (Box API, Salesforce API) for full workflow."
echo ""
echo "✓ Demo flow benchmark complete!"
echo ""
