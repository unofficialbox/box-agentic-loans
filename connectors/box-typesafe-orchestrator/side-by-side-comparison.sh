#!/bin/bash
# Side-by-Side Performance Comparison: TypeSafe vs Conversational AI
# Measures REAL performance for the same operations

set -e

# Load keys from the repo-root .env (gitignored; copy from .env.sample).
ENV_FILE="$(cd "$(dirname "$0")/../.." && pwd)/.env"
if [ -f "$ENV_FILE" ]; then
    set -a; . "$ENV_FILE"; set +a
fi

if [ -z "$TYPESAFE_API_KEY" ]; then
    echo "❌ Error: TYPESAFE_API_KEY not set. Add it to .env (see .env.sample)."
    exit 1
fi
TYPESAFE_KEY="$TYPESAFE_API_KEY"
ANTHROPIC_KEY="${ANTHROPIC_API_KEY}"

if [ -z "$ANTHROPIC_KEY" ]; then
    echo "❌ Error: ANTHROPIC_API_KEY not set"
    echo "   Set it with: export ANTHROPIC_API_KEY=<your-anthropic-key>"
    exit 1
fi

echo ""
echo "🎯 Side-by-Side Performance Comparison"
echo "   TypeSafe vs Conversational AI (Claude)"
echo ""
echo "Testing the same operations with both approaches..."
echo ""

# Test 1: Intent Routing
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📊 Test 1: Intent Routing"
echo "   Query: 'What's the risk profile for this loan?'"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# TypeSafe approach
echo "🔷 TypeSafe (System One API):"
TYPESAFE_START=$(date +%s%N)
TYPESAFE_RESULT=$(curl -s -X POST https://api.typesafe.ai/v1/systemone \
  -H "Authorization: Bearer $TYPESAFE_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "state": "What is the risk profile for this loan?",
    "model": "jev-latest",
    "questions": {
      "intent": {
        "type": "choice",
        "instructions": "What operation should handle this user request?",
        "criteria": {
          "search_documents": "Find or search for loan documents",
          "extract_terms": "Extract loan terms from documents",
          "validate_policy": "Check compliance with credit policy",
          "score_risk": "Assess loan or portfolio risk",
          "generate_letter": "Create commitment or other letters",
          "prepare_signature": "Send documents for signing",
          "review_history": "Compare with prior loans or analyze history",
          "update_record": "Modify loan record fields"
        }
      }
    }
  }')
TYPESAFE_END=$(date +%s%N)
TYPESAFE_TIME=$(( ($TYPESAFE_END - $TYPESAFE_START) / 1000000 ))

echo "   Result: $(echo "$TYPESAFE_RESULT" | jq -r '.answers.intent.choice // "error"')"
echo "   Confidence: $(echo "$TYPESAFE_RESULT" | jq -r '.answers.intent.confidence // "error"')"
echo "   Latency: ${TYPESAFE_TIME}ms"
echo "   Tokens: $(echo "$TYPESAFE_RESULT" | jq -r '.usage.input_tokens // 0')in + $(echo "$TYPESAFE_RESULT" | jq -r '.usage.output_tokens // 0')out = $(echo "$TYPESAFE_RESULT" | jq '(.usage.input_tokens // 0) + (.usage.output_tokens // 0)')"
echo ""

# Claude approach
echo "🔶 Conversational AI (Claude):"
CLAUDE_START=$(date +%s%N)
CLAUDE_RESULT=$(curl -s -X POST https://api.anthropic.com/v1/messages \
  -H "x-api-key: $ANTHROPIC_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "claude-3-5-sonnet-20241022",
    "max_tokens": 1024,
    "messages": [{
      "role": "user",
      "content": "User query: \"What is the risk profile for this loan?\"\n\nYou are a loan origination system router. Based on this query, which operation should handle it? Choose ONE from:\n- search_documents (Find or search for loan documents)\n- extract_terms (Extract loan terms from documents)\n- validate_policy (Check compliance with credit policy)\n- score_risk (Assess loan or portfolio risk)\n- generate_letter (Create commitment or other letters)\n- prepare_signature (Send documents for signing)\n- review_history (Compare with prior loans or analyze history)\n- update_record (Modify loan record fields)\n\nRespond with ONLY the operation name, nothing else."
    }]
  }')
CLAUDE_END=$(date +%s%N)
CLAUDE_TIME=$(( ($CLAUDE_END - $CLAUDE_START) / 1000000 ))

echo "   Result: $(echo "$CLAUDE_RESULT" | jq -r '.content[0].text // "error"' | tr -d '\n')"
echo "   Confidence: N/A (no confidence score)"
echo "   Latency: ${CLAUDE_TIME}ms"
echo "   Tokens: $(echo "$CLAUDE_RESULT" | jq -r '.usage.input_tokens // 0')in + $(echo "$CLAUDE_RESULT" | jq -r '.usage.output_tokens // 0')out = $(echo "$CLAUDE_RESULT" | jq '(.usage.input_tokens // 0) + (.usage.output_tokens // 0)')"
echo ""

IMPROVEMENT_1=$(echo "scale=1; $CLAUDE_TIME / $TYPESAFE_TIME" | bc)
echo "⚡ Performance: TypeSafe ${IMPROVEMENT_1}x faster"
echo ""

# Test 2: Document Classification
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📊 Test 2: Document Classification Validation"
echo "   Box AI classified a document as 'Term Sheet'"
echo "   Should we auto-apply or review?"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# TypeSafe approach
echo "🔷 TypeSafe (System One API):"
TYPESAFE_START=$(date +%s%N)
TYPESAFE_RESULT=$(curl -s -X POST https://api.typesafe.ai/v1/systemone \
  -H "Authorization: Bearer $TYPESAFE_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "state": {
      "boxClassification": "Term Sheet",
      "loanType": "Commercial Real Estate",
      "loanStage": "Underwriting",
      "existingDocuments": ["Loan Application", "Financial Statement"]
    },
    "model": "jev-latest",
    "questions": {
      "confidence": {
        "type": "score",
        "instructions": "How confident should we be in Box AI classification?",
        "criteria": [
          "High: Clear match, apply automatically",
          "Medium: Reasonable match, flag for review",
          "Low: Uncertain, needs manual classification",
          "Wrong: Box misclassified, override needed"
        ]
      },
      "contextually_appropriate": {
        "type": "noul",
        "instructions": "Does this document type make sense for this loan type and stage?"
      }
    }
  }')
TYPESAFE_END=$(date +%s%N)
TYPESAFE_TIME=$(( ($TYPESAFE_END - $TYPESAFE_START) / 1000000 ))

echo "   Confidence Score: $(echo "$TYPESAFE_RESULT" | jq -r '.answers.confidence.score // "error"')"
echo "   Contextually Appropriate: $(echo "$TYPESAFE_RESULT" | jq -r '.answers.contextually_appropriate.noul // "error"')"
echo "   Latency: ${TYPESAFE_TIME}ms"
echo "   Tokens: $(echo "$TYPESAFE_RESULT" | jq -r '.usage.input_tokens // 0')in + $(echo "$TYPESAFE_RESULT" | jq -r '.usage.output_tokens // 0')out = $(echo "$TYPESAFE_RESULT" | jq '(.usage.input_tokens // 0) + (.usage.output_tokens // 0)')"
echo ""

# Claude approach
echo "🔶 Conversational AI (Claude):"
CLAUDE_START=$(date +%s%N)
CLAUDE_RESULT=$(curl -s -X POST https://api.anthropic.com/v1/messages \
  -H "x-api-key: $ANTHROPIC_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "claude-3-5-sonnet-20241022",
    "max_tokens": 1024,
    "messages": [{
      "role": "user",
      "content": "Box AI classified a document as \"Term Sheet\" for a Commercial Real Estate loan in Underwriting stage. Existing documents: Loan Application, Financial Statement.\n\nShould we:\n1. Auto-apply this classification (high confidence)\n2. Flag for quick review (medium confidence)\n3. Require manual classification (low confidence)\n\nRespond with just the number (1, 2, or 3)."
    }]
  }')
CLAUDE_END=$(date +%s%N)
CLAUDE_TIME=$(( ($CLAUDE_END - $CLAUDE_START) / 1000000 ))

echo "   Decision: $(echo "$CLAUDE_RESULT" | jq -r '.content[0].text // "error"' | tr -d '\n')"
echo "   Confidence: N/A (no confidence score)"
echo "   Latency: ${CLAUDE_TIME}ms"
echo "   Tokens: $(echo "$CLAUDE_RESULT" | jq -r '.usage.input_tokens // 0')in + $(echo "$CLAUDE_RESULT" | jq -r '.usage.output_tokens // 0')out = $(echo "$CLAUDE_RESULT" | jq '(.usage.input_tokens // 0) + (.usage.output_tokens // 0)')"
echo ""

IMPROVEMENT_2=$(echo "scale=1; $CLAUDE_TIME / $TYPESAFE_TIME" | bc)
echo "⚡ Performance: TypeSafe ${IMPROVEMENT_2}x faster"
echo ""

# Test 3: Risk Scoring
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📊 Test 3: Loan Risk Scoring"
echo "   Loan: \$4.8M, 85% LTV, 1.12x DSCR"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# TypeSafe approach
echo "🔷 TypeSafe (System One API):"
TYPESAFE_START=$(date +%s%N)
TYPESAFE_RESULT=$(curl -s -X POST https://api.typesafe.ai/v1/systemone \
  -H "Authorization: Bearer $TYPESAFE_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "state": {
      "loan": {
        "amount": 4800000,
        "ltv": 0.85,
        "dscr": 1.12,
        "termMonths": 84,
        "interestRate": 7.25
      }
    },
    "model": "jev-latest",
    "questions": {
      "creditRisk": {
        "type": "score",
        "instructions": "Assess overall credit risk",
        "criteria": [
          "Low risk: Strong financials, conservative leverage",
          "Medium risk: Adequate financials, moderate leverage",
          "High risk: Weak financials, aggressive leverage",
          "Critical risk: Severe financial distress"
        ]
      },
      "collateralRisk": {
        "type": "score",
        "instructions": "Evaluate collateral adequacy",
        "criteria": [
          "Excellent: LTV <60%, high-quality assets",
          "Good: LTV 60-75%, standard assets",
          "Fair: LTV 75-85%, weaker assets",
          "Poor: LTV >85%, weak assets"
        ]
      }
    }
  }')
TYPESAFE_END=$(date +%s%N)
TYPESAFE_TIME=$(( ($TYPESAFE_END - $TYPESAFE_START) / 1000000 ))

echo "   Credit Risk: $(echo "$TYPESAFE_RESULT" | jq -r '.answers.creditRisk.score // "error"')"
echo "   Collateral Risk: $(echo "$TYPESAFE_RESULT" | jq -r '.answers.collateralRisk.score // "error"')"
echo "   Latency: ${TYPESAFE_TIME}ms"
echo "   Tokens: $(echo "$TYPESAFE_RESULT" | jq -r '.usage.input_tokens // 0')in + $(echo "$TYPESAFE_RESULT" | jq -r '.usage.output_tokens // 0')out = $(echo "$TYPESAFE_RESULT" | jq '(.usage.input_tokens // 0) + (.usage.output_tokens // 0)')"
echo ""

# Claude approach
echo "🔶 Conversational AI (Claude):"
CLAUDE_START=$(date +%s%N)
CLAUDE_RESULT=$(curl -s -X POST https://api.anthropic.com/v1/messages \
  -H "x-api-key: $ANTHROPIC_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "claude-3-5-sonnet-20241022",
    "max_tokens": 1024,
    "messages": [{
      "role": "user",
      "content": "Analyze this commercial loan:\n- Amount: $4,800,000\n- LTV: 85%\n- DSCR: 1.12x\n- Term: 84 months\n- Rate: 7.25%\n\nScore the credit risk (0-3 scale: 0=Low, 1=Medium, 2=High, 3=Critical) and collateral risk (0-3 scale: 0=Excellent, 1=Good, 2=Fair, 3=Poor).\n\nRespond with ONLY two numbers separated by comma: credit_risk,collateral_risk"
    }]
  }')
CLAUDE_END=$(date +%s%N)
CLAUDE_TIME=$(( ($CLAUDE_END - $CLAUDE_START) / 1000000 ))

echo "   Scores: $(echo "$CLAUDE_RESULT" | jq -r '.content[0].text // "error"' | tr -d '\n')"
echo "   Confidence: N/A (no confidence score)"
echo "   Latency: ${CLAUDE_TIME}ms"
echo "   Tokens: $(echo "$CLAUDE_RESULT" | jq -r '.usage.input_tokens // 0')in + $(echo "$CLAUDE_RESULT" | jq -r '.usage.output_tokens // 0')out = $(echo "$CLAUDE_RESULT" | jq '(.usage.input_tokens // 0) + (.usage.output_tokens // 0)')"
echo ""

IMPROVEMENT_3=$(echo "scale=1; $CLAUDE_TIME / $TYPESAFE_TIME" | bc)
echo "⚡ Performance: TypeSafe ${IMPROVEMENT_3}x faster"
echo ""

# Summary
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📈 Summary"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "TypeSafe Performance Improvement:"
echo "  • Intent Routing: ${IMPROVEMENT_1}x faster"
echo "  • Classification: ${IMPROVEMENT_2}x faster"
echo "  • Risk Scoring: ${IMPROVEMENT_3}x faster"
echo ""
echo "✓ Comparison complete!"
echo ""
