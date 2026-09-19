#!/bin/bash
# TypeSafe Performance Benchmark
# Measures REAL TypeSafe API performance

set -e

TYPESAFE_KEY="${TYPESAFE_API_KEY:-apikey_2177853eb42e0d54c2cb5f148d156e5ea34_2a371a210e195002e696ff68282229e4338a27f384d84a9b8ba75342e748ea0d}"

echo ""
echo "🚀 TypeSafe Real Performance Benchmark"
echo ""
echo "Measuring actual TypeSafe API performance..."
echo ""

# Test 1: Intent Routing (10 iterations)
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📊 Test 1: Intent Routing (10 iterations)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

TOTAL_TIME=0
TOTAL_TOKENS=0
CONFIDENCES=()

for i in {1..10}; do
    START=$(date +%s%N)
    RESULT=$(curl -s -X POST https://api.typesafe.ai/v1/systemone \
      -H "Authorization: Bearer $TYPESAFE_KEY" \
      -H "Content-Type: application/json" \
      -d '{
        "state": "What is the risk profile for this loan?",
        "model": "jev-latest",
        "questions": {
          "intent": {
            "type": "choice",
            "instructions": "What operation should handle this?",
            "criteria": {
              "search_documents": "Find documents",
              "extract_terms": "Extract terms",
              "validate_policy": "Check policy",
              "score_risk": "Assess risk",
              "generate_letter": "Create letter",
              "prepare_signature": "Send for signing",
              "review_history": "Review history",
              "update_record": "Update record"
            }
          }
        }
      }')
    END=$(date +%s%N)

    TIME=$(( ($END - $START) / 1000000 ))
    TOKENS=$(echo "$RESULT" | jq '(.usage.input_tokens // 0) + (.usage.output_tokens // 0)')
    CONFIDENCE=$(echo "$RESULT" | jq -r '.answers.intent.confidence // 0')

    TOTAL_TIME=$(( $TOTAL_TIME + $TIME ))
    TOTAL_TOKENS=$(( $TOTAL_TOKENS + $TOKENS ))
    CONFIDENCES+=($CONFIDENCE)

    echo "  Iteration $i: ${TIME}ms, tokens: $TOKENS, confidence: $CONFIDENCE"
done

AVG_TIME=$(( $TOTAL_TIME / 10 ))
AVG_TOKENS=$(( $TOTAL_TOKENS / 10 ))

echo ""
echo "Results:"
echo "  Average latency: ${AVG_TIME}ms"
echo "  Average tokens: $AVG_TOKENS"
echo "  Confidence range: ${CONFIDENCES[0]} - ${CONFIDENCES[9]}"
echo ""

# Test 2: Classification (10 iterations)
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📊 Test 2: Classification Validation (10 iterations)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

TOTAL_TIME=0
TOTAL_TOKENS=0

for i in {1..10}; do
    START=$(date +%s%N)
    RESULT=$(curl -s -X POST https://api.typesafe.ai/v1/systemone \
      -H "Authorization: Bearer $TYPESAFE_KEY" \
      -H "Content-Type: application/json" \
      -d '{
        "state": {
          "boxClassification": "Term Sheet",
          "loanType": "Commercial Real Estate",
          "loanStage": "Underwriting"
        },
        "model": "jev-latest",
        "questions": {
          "confidence": {
            "type": "score",
            "instructions": "How confident in this classification?",
            "criteria": ["High", "Medium", "Low", "Wrong"]
          },
          "appropriate": {
            "type": "noul",
            "instructions": "Does this make sense for this loan?"
          }
        }
      }')
    END=$(date +%s%N)

    TIME=$(( ($END - $START) / 1000000 ))
    TOKENS=$(echo "$RESULT" | jq '(.usage.input_tokens // 0) + (.usage.output_tokens // 0)')

    TOTAL_TIME=$(( $TOTAL_TIME + $TIME ))
    TOTAL_TOKENS=$(( $TOTAL_TOKENS + $TOKENS ))

    echo "  Iteration $i: ${TIME}ms, tokens: $TOKENS"
done

AVG_TIME=$(( $TOTAL_TIME / 10 ))
AVG_TOKENS=$(( $TOTAL_TOKENS / 10 ))

echo ""
echo "Results:"
echo "  Average latency: ${AVG_TIME}ms"
echo "  Average tokens: $AVG_TOKENS"
echo ""

# Test 3: Risk Scoring (10 iterations)
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📊 Test 3: Risk Scoring (10 iterations)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

TOTAL_TIME=0
TOTAL_TOKENS=0

for i in {1..10}; do
    START=$(date +%s%N)
    RESULT=$(curl -s -X POST https://api.typesafe.ai/v1/systemone \
      -H "Authorization: Bearer $TYPESAFE_KEY" \
      -H "Content-Type: application/json" \
      -d '{
        "state": {
          "loan": {
            "amount": 4800000,
            "ltv": 0.85,
            "dscr": 1.12
          }
        },
        "model": "jev-latest",
        "questions": {
          "creditRisk": {
            "type": "score",
            "instructions": "Credit risk assessment",
            "criteria": ["Low", "Medium", "High", "Critical"]
          },
          "collateralRisk": {
            "type": "score",
            "instructions": "Collateral adequacy",
            "criteria": ["Excellent", "Good", "Fair", "Poor"]
          }
        }
      }')
    END=$(date +%s%N)

    TIME=$(( ($END - $START) / 1000000 ))
    TOKENS=$(echo "$RESULT" | jq '(.usage.input_tokens // 0) + (.usage.output_tokens // 0)')

    TOTAL_TIME=$(( $TOTAL_TIME + $TIME ))
    TOTAL_TOKENS=$(( $TOTAL_TOKENS + $TOKENS ))

    echo "  Iteration $i: ${TIME}ms, tokens: $TOKENS"
done

AVG_TIME=$(( $TOTAL_TIME / 10 ))
AVG_TOKENS=$(( $TOTAL_TOKENS / 10 ))

echo ""
echo "Results:"
echo "  Average latency: ${AVG_TIME}ms"
echo "  Average tokens: $AVG_TOKENS"
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✓ Benchmark complete!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
