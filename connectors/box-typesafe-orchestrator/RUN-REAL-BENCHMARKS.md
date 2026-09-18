# Run Real Performance Benchmarks

Step-by-step guide to run REAL side-by-side performance comparison between TypeSafe and Conversational AI.

---

## What This Tests

**Same operations, measured with real API calls:**

1. **Intent Routing** - "What's the risk profile for this loan?"
   - TypeSafe: Choice question with 8 options
   - Claude: Conversational prompt asking to pick from 8 options

2. **Document Classification** - Box AI classified as "Term Sheet", should we auto-apply?
   - TypeSafe: Score + Noul questions for confidence and context
   - Claude: Conversational prompt asking for decision (auto/review/manual)

3. **Loan Risk Scoring** - Score $4.8M loan with 85% LTV, 1.12x DSCR
   - TypeSafe: Two Score questions (credit risk + collateral risk)
   - Claude: Conversational prompt asking for numeric scores

---

## Prerequisites

You need TWO API keys:
- ✅ TypeSafe API key (you have this)
- ❓ Anthropic API key (for Claude)

---

## Step 1: Get Your Anthropic API Key

If you don't have one:
1. Go to: https://console.anthropic.com/
2. Sign in
3. Go to API Keys
4. Create new key

Or if you're running from Claude Desktop, you already have access to Claude API.

---

## Step 2: Set Environment Variables

```bash
export TYPESAFE_API_KEY="apikey_2177853eb42e0d54c2cb5f148d156e5ea34_2a371a210e195002e696ff68282229e4338a27f384d84a9b8ba75342e748ea0d"

export ANTHROPIC_API_KEY="your_anthropic_key_here"
```

---

## Step 3: Run the Comparison

```bash
cd /Users/kadams/Developer/partner-integrations/salesforce/dreamforce-demos/box-claudeforce-loans/connectors/box-typesafe-orchestrator

./side-by-side-comparison.sh
```

---

## Expected Output

```
🎯 Side-by-Side Performance Comparison
   TypeSafe vs Conversational AI (Claude)

Testing the same operations with both approaches...

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 Test 1: Intent Routing
   Query: 'What's the risk profile for this loan?'
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🔷 TypeSafe (System One API):
   Result: score_risk
   Confidence: 0.97
   Latency: XXXXms
   Tokens: XXXin + XXout = XXX

🔶 Conversational AI (Claude):
   Result: score_risk
   Confidence: N/A (no confidence score)
   Latency: XXXXms
   Tokens: XXXin + XXout = XXX

⚡ Performance: TypeSafe X.Xx faster

... (more tests)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📈 Summary
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

TypeSafe Performance Improvement:
  • Intent Routing: X.Xx faster
  • Classification: X.Xx faster
  • Risk Scoring: X.Xx faster

✓ Comparison complete!
```

---

## What Gets Measured

For each operation:
- ⏱️ **Latency** (milliseconds) - Actual API response time
- 🎯 **Result** - The actual decision/score returned
- 📊 **Confidence** - TypeSafe provides this, Claude doesn't
- 💰 **Token Usage** - Input + output tokens

---

## Alternative: If You Don't Have Anthropic API Key

You can run just the TypeSafe tests to measure real performance:

```bash
# Test intent routing (30 iterations)
time for i in {1..30}; do
  curl -s -X POST https://api.typesafe.ai/v1/systemone \
    -H "Authorization: Bearer $TYPESAFE_API_KEY" \
    -H "Content-Type: application/json" \
    -d '{
      "state": "What is the risk for this loan?",
      "model": "jev-latest",
      "questions": {
        "intent": {
          "type": "choice",
          "instructions": "What operation?",
          "criteria": {
            "search": "Find docs",
            "score_risk": "Assess risk",
            "validate": "Check policy"
          }
        }
      }
    }' > /dev/null
done
```

Then divide total time by 30 to get average latency.

---

## Cost Estimate

**TypeSafe** (3 operations):
- ~1,200 tokens total
- ~$0.01 at typical pricing

**Claude** (3 operations):
- ~1,500 tokens total
- ~$0.04 at typical pricing

**Total**: ~$0.05 for the comparison

---

## Troubleshooting

### "ANTHROPIC_API_KEY not set"
Set it with: `export ANTHROPIC_API_KEY=your_key_here`

### "curl: command not found"
Install curl: `brew install curl` (macOS)

### "jq: command not found"
Install jq: `brew install jq` (macOS)

### Slow API responses
Both APIs can take 5-15 seconds depending on:
- Network latency
- API load
- Request complexity

This is NORMAL - we're measuring real performance!

---

## After Running

The script will show:
1. **Actual latency** for each approach
2. **Actual token usage** 
3. **Real improvement factor** (not estimated)
4. **Confidence scores** (TypeSafe only)

Use these REAL numbers to update all benchmark documentation!

---

## Save Results

The script outputs to terminal. To save:

```bash
./side-by-side-comparison.sh | tee real-benchmark-results.txt
```

Then share `real-benchmark-results.txt` with the team.

---

Ready to run? Just execute:

```bash
export ANTHROPIC_API_KEY="your_key_here"
./side-by-side-comparison.sh
```
