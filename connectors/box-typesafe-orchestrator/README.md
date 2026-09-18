# TypeSafe Orchestrator

Intelligent orchestration layer for Box + Salesforce loan origination using TypeSafe.ai's System One API.

## Architecture

```
User/AI Harness
       ↓
TypeSafe Orchestrator (this package)
  • Routes intents → MCP tools
  • Validates confidence
  • Scores risk
  • Orchestrates workflows
       ↓
Box MCP + Salesforce MCP
  • Execute data operations
```

## Installation

```bash
npm install
# or
pnpm install
```

## Configuration

1. Copy `.env.example` to `.env`
2. Add your TypeSafe API key:
   ```bash
   TYPESAFE_API_KEY=your_key_from_console.typesafe.ai
   ```

Get your API key at: https://console.typesafe.ai/settings/keys

## Usage

```typescript
import { TypeSafeOrchestrator } from '@acme-loans/typesafe-orchestrator';

const orchestrator = new TypeSafeOrchestrator({
  apiKey: process.env.TYPESAFE_API_KEY,
  model: 'jev-latest'
});

// Route user intent
const route = await orchestrator.routeIntent(
  "What's the risk profile for Harborview?",
  { sessionContext }
);

// Validate document classification
const validation = await orchestrator.validateClassification(
  "Term Sheet",  // Box AI's classification
  { loanId, loanType, stage }
);

// Score loan risk
const risk = await orchestrator.scoreLoanRisk(loanId, {
  loanData,  // From Salesforce MCP
  documents  // From Box MCP
});
```

## Core Operations

### Intent Routing
Routes user queries to appropriate MCP operations with confidence scores.

### Classification Validation
Validates Box AI document classifications in loan context.

### Risk Scoring
Scores loan risk across multiple dimensions with confidence.

### Cross-System Validation
Validates consistency between Box documents and Salesforce records.

### Portfolio Intelligence
Analyzes patterns across multiple loans for portfolio-level insights.

## Development

```bash
# Build
npm run build

# Watch mode
npm run dev

# Run tests
npm test

# Watch tests
npm run test:watch

# Lint
npm run lint

# Format
npm run format
```

## Testing

Tests use Vitest with TypeSafe API mocking.

```bash
npm test
```

## Architecture Documentation

See project docs:
- [Integration Plan](../../TYPESAFE-INTEGRATION-PLAN.md)
- [Architecture Summary](../../docs/TYPESAFE-ARCHITECTURE-SUMMARY.md)
- [Separation of Concerns](../../docs/TYPESAFE-SEPARATION-OF-CONCERNS.md)

## License

MIT
