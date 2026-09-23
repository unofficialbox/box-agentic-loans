# TypeSafe Demo Setup Guide

Quick setup guide for presenting the TypeSafe-enhanced loan origination demo.

## Prerequisites

1. **Standard demo working** - Follow [SETUP.md](SETUP.md) first
2. **TypeSafe API key** - Get from https://console.typesafe.ai/settings/keys
3. **Node.js 18+** - For TypeScript orchestrator

---

## Installation

### 1. Install TypeSafe Orchestrator

```bash
cd connectors/box-typesafe-orchestrator
npm install
```

### 2. Configure Environment

```bash
# From the repo root, copy the sample (.env is gitignored)
cp .env.sample .env

# Edit .env
TYPESAFE_API_KEY=<your-typesafe-key>
TYPESAFE_MODEL=jev-latest

# Confidence thresholds (optional)
TYPESAFE_HIGH_CONFIDENCE_THRESHOLD=0.85
TYPESAFE_MEDIUM_CONFIDENCE_THRESHOLD=0.50
```

### 3. Build Orchestrator

```bash
npm run build
```

### 4. Test Installation

```bash
# Create test script
cat > test-orchestrator.ts <<'EOF'
import { TypeSafeOrchestrator } from './dist/index.js';

const orchestrator = new TypeSafeOrchestrator({
  apiKey: process.env.TYPESAFE_API_KEY!
});

const route = await orchestrator.routeIntent(
  "What's the risk for this loan?"
);

console.log('✓ TypeSafe working:', route.intent);
EOF

# Run test
node --loader ts-node/esm test-orchestrator.ts
```

Should output: `✓ TypeSafe working: score_risk`

---

## Claude Desktop Integration

### Option A: Add as MCP Server (Recommended)

Edit `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "box": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-box"]
    },
    "los-salesforce": {
      "command": "node",
      "args": ["/path/to/los-salesforce-mcp/dist/index.js"]
    },
    "typesafe-orchestrator": {
      "command": "node",
      "args": [
        "/Users/kadams/Developer/partner-integrations/salesforce/dreamforce-demos/box-claudeforce-loans/connectors/box-typesafe-orchestrator/dist/index.js"
      ],
      "env": {
        "TYPESAFE_API_KEY": "<your-typesafe-key>"
      }
    }
  }
}
```

Restart Claude Desktop.

### Option B: Use as Library (Alternative)

In your demo scripts, import directly:

```typescript
import { TypeSafeOrchestrator } from './connectors/box-typesafe-orchestrator/dist/index.js';

const orchestrator = new TypeSafeOrchestrator({
  apiKey: process.env.TYPESAFE_API_KEY!
});
```

---

## Demo Configuration

### Custom Instructions for Claude Desktop

Add to your Claude Desktop session:

```text
You have access to three systems:
1. Box MCP - for document operations (unstructured data)
2. Salesforce LOS MCP - for loan records (structured data)
3. TypeSafe Orchestrator - for routing, validation, and scoring (decisions)

Use TypeSafe to:
- Route user intents → decide which MCP tools to call
- Validate classifications → confidence check on Box AI results
- Score risk → multi-dimensional loan risk assessment
- Validate consistency → compare Box docs vs Salesforce records
- Analyze portfolios → detect patterns across loans

Use Box MCP for:
- query_metadata, box_ai_extract, create_docgen_batch, get_file_preview

Use Salesforce MCP for:
- getLoanPackage, listLoans, extractLoanTerms, applyLoanTerms, prepareSignatureRequest

ALWAYS show confidence scores when using TypeSafe decisions.
ALWAYS use TypeSafe for routing before calling MCP tools.
```

### Confidence Threshold Tuning

Adjust based on audience:

**Conservative (banking demo)**:
```bash
TYPESAFE_HIGH_CONFIDENCE_THRESHOLD=0.90
TYPESAFE_MEDIUM_CONFIDENCE_THRESHOLD=0.70
```

**Standard (balanced)**:
```bash
TYPESAFE_HIGH_CONFIDENCE_THRESHOLD=0.85
TYPESAFE_MEDIUM_CONFIDENCE_THRESHOLD=0.50
```

**Aggressive (speed demo)**:
```bash
TYPESAFE_HIGH_CONFIDENCE_THRESHOLD=0.75
TYPESAFE_MEDIUM_CONFIDENCE_THRESHOLD=0.40
```

---

## Verification Checklist

Before presenting:

- [ ] TypeSafe API key valid (`npm run test` passes)
- [ ] Orchestrator builds without errors (`npm run build`)
- [ ] Claude Desktop sees typesafe-orchestrator MCP server
- [ ] Can route simple intent: "What's the risk?"
- [ ] Can validate classification with confidence score
- [ ] Performance improvement visible (time the same operation)

### Quick Verification Script

```bash
# Test all operations
node <<'EOF'
import { TypeSafeOrchestrator } from './connectors/box-typesafe-orchestrator/dist/index.js';

const orch = new TypeSafeOrchestrator({
  apiKey: process.env.TYPESAFE_API_KEY
});

console.log('Testing TypeSafe operations...\n');

// Test 1: Intent routing
const route = await orch.routeIntent("Find critical risk documents");
console.log('✓ Intent routing:', route.intent);

// Test 2: Classification validation
const validation = await orch.validateClassification(
  "Term Sheet",
  { loanId: "LN-2026-0042", loanType: "Commercial Real Estate", status: "Underwriting" }
);
console.log('✓ Classification:', validation.recommendation, `(${validation.confidence.level} confidence)`);

// Test 3: Risk scoring
const risk = await orch.scoreLoanRisk(
  { id: "1", amount: 4800000, ltv: 0.85, dscr: 1.12, termMonths: 84, interestRate: 7.25, borrower: "Test" },
  []
);
console.log('✓ Risk scoring:', risk.riskLevel, `(${risk.confidence.toFixed(2)} confidence)`);

console.log('\n✓ All TypeSafe operations working!');
EOF
```

---

## Presenting the Demo

### Side-by-Side Comparison

**Terminal 1: Standard Flow**
```bash
# Time standard operation
time {
  # Claude processes query
  # Calls Box MCP
  # Calls Salesforce MCP
  # Returns result
}
```

**Terminal 2: TypeSafe Flow**
```bash
# Time TypeSafe operation
time {
  # TypeSafe routes intent (0.2s)
  # Calls appropriate MCPs in parallel
  # TypeSafe validates confidence
  # Returns result with confidence score
}
```

Show: **6-10x faster with confidence scores**

### Live Performance Metrics

Display in terminal:
```typescript
console.time('Standard flow');
// ... standard operation
console.timeEnd('Standard flow');

console.time('TypeSafe flow');
// ... TypeSafe operation  
console.timeEnd('TypeSafe flow');

console.log(`Improvement: ${standardTime / typesafeTime}x faster`);
```

### Confidence Visualization

Show confidence scores:
```typescript
const result = await orchestrator.validateClassification(...);

console.log(`
Classification: ${result.documentType}
Confidence: ${result.confidence.level.toUpperCase()} (${(result.confidence.score * 100).toFixed(0)}%)
Action: ${result.recommendation}
${result.confidence.autoProcess ? '✓ Auto-processed' : '⚠ Needs review'}
`);
```

---

## Troubleshooting

### "TypeSafe API key not found"
```bash
# Verify key is set
echo $TYPESAFE_API_KEY

# If empty, set it
export TYPESAFE_API_KEY=<your-typesafe-key>

# Or add to .env
echo "TYPESAFE_API_KEY=<your-typesafe-key>" >> .env
```

### "Module not found: typesafe-sdk"
```bash
cd connectors/box-typesafe-orchestrator
npm install
npm run build
```

### "Rate limit exceeded"
```bash
# TypeSafe hit rate limit - wait or upgrade plan
# Default: 100 requests/minute

# Check current usage at:
# https://console.typesafe.ai/usage
```

### Performance not improving
```bash
# 1. Verify TypeSafe is actually being called
console.log('Using TypeSafe for routing...');

# 2. Check network latency
time curl -X POST https://api.typesafe.ai/v1/systemone \
  -H "Authorization: Bearer $TYPESAFE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"state":"test","model":"jev-latest","questions":{}}'

# Should be < 500ms
```

---

## Demo Variations

### Quick Demo (3 min)
1. Show standard doc classification (2-3s)
2. Show TypeSafe classification (0.3s)
3. Compare: "6x faster + confidence score"

### Full Demo (8 min)
1. Borrower applies (browser)
2. Find critical docs (TypeSafe routing)
3. Extract & validate (TypeSafe parallel checks)
4. Generate commitment (TypeSafe template selection)
5. Show full performance comparison

### Technical Deep Dive (15 min)
1. Architecture diagram
2. Show TypeSafe API requests/responses
3. Explain confidence-based routing
4. Live code walkthrough
5. Q&A on implementation

---

## Cleanup After Demo

```bash
# Stop any running TypeSafe processes
pkill -f typesafe-orchestrator

# Optional: Clear test data
python3 scripts/cleanup_demo.py --status Application --yes
```

---

## Resources

- **TypeSafe Console**: https://console.typesafe.ai
- **API Documentation**: https://docs.typesafe.ai
- **Integration Plan**: [TYPESAFE-INTEGRATION-PLAN.md](../TYPESAFE-INTEGRATION-PLAN.md)
- **Demo Clickpath**: [DEMO-CLICKPATH-TYPESAFE.md](../DEMO-CLICKPATH-TYPESAFE.md)
- **Support**: GitHub issues or TypeSafe Discord

---

## Next Steps

After successful demo:
1. Extract `box-typesafe-orchestrator` to standalone repo
2. Publish to npm for reuse
3. Add to other Box integrations
4. Contribute examples and patterns

Happy presenting! 🎉
