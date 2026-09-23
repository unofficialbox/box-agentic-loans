# Integration Guide: Box AI Chat with LOS Demo

This document explains how to integrate the Agent Chat interface with the existing LOS Loan Tools and Box MCP connectors.

## Architecture

```
┌────────────────────────────────────────────────────────────┐
│  React Chat UI (Port 3003)                                │
│  - Box-style interface                                     │
│  - Document grid                                           │
│  - Session history                                         │
└────────────────┬───────────────────────────────────────────┘
                 │
                 ▼
┌────────────────────────────────────────────────────────────┐
│  <box-agent-chat> Web Component                           │
│  - Streaming chat thread                                   │
│  - Citation chips                                          │
│  - Human-in-loop proposals                                 │
└────────────────┬───────────────────────────────────────────┘
                 │
                 ▼
┌────────────────────────────────────────────────────────────┐
│  AgentChatTransport Implementation                         │
│  ┌──────────────────────────────────────────────────────┐ │
│  │ sendMessage(request) {                               │ │
│  │   1. Route intent with TypeSafe                      │ │
│  │   2. Call Box/LOS MCP based on routing              │ │
│  │   3. Stream results back via request.onEvent()      │ │
│  │ }                                                     │ │
│  └──────────────────────────────────────────────────────┘ │
└────────────────┬───────────────────────────────────────────┘
                 │
    ┌────────────┼────────────┐
    │            │            │
    ▼            ▼            ▼
┌────────┐  ┌────────┐  ┌─────────────┐
│  Box   │  │  LOS   │  │  TypeSafe   │
│  MCP   │  │  MCP   │  │ Orchestrator│
└────────┘  └────────┘  └─────────────┘
```

## Implementation: Real Transport

Replace the demo transport in `AgentChatInterface.tsx` with a real implementation:

### Step 1: Create TypeSafe-Powered Transport

```typescript
// src/transport/MCPTransport.ts
import type {
  AgentChatTransport,
  AgentSendRequest,
  AgentResolveActionRequest,
  AgentActionProposal
} from "@unofficialbox/box-open-elements/patterns/agent-chat/types";
import { TypeSafeOrchestrator } from "@acme-loans/box-typesafe-orchestrator";

export class MCPTransport implements AgentChatTransport {
  private orchestrator: TypeSafeOrchestrator;
  private boxMCP: BoxMCPClient;
  private losMCP: LOSMCPClient;

  constructor() {
    this.orchestrator = new TypeSafeOrchestrator({
      apiKey: process.env.TYPESAFE_API_KEY!
    });
    // Initialize MCP clients
  }

  async sendMessage(request: AgentSendRequest): Promise<void> {
    // Step 1: Route intent with TypeSafe (~500ms)
    const routing = await this.orchestrator.routeIntent(request.body);
    
    // Step 2: Execute based on routing decision
    switch (routing.primaryOperation) {
      case 'search_documents':
        await this.searchDocuments(request, routing);
        break;
      
      case 'extract_terms':
        await this.extractTerms(request, routing);
        break;
      
      case 'validate_policy':
        await this.validatePolicy(request, routing);
        break;
      
      case 'score_risk':
        await this.scoreRisk(request, routing);
        break;
      
      case 'compare_history':
        await this.compareHistory(request, routing);
        break;
    }
  }

  private async searchDocuments(
    request: AgentSendRequest,
    routing: IntentRoute
  ): Promise<void> {
    // Call Box MCP metadata query
    const results = await this.boxMCP.queryMetadata({
      template: 'losDocument',
      query: routing.metadata.query
    });

    // Stream results
    let text = `Found ${results.length} documents:\n\n`;
    request.onEvent({ kind: 'delta', text });

    for (const doc of results) {
      text += `• ${doc.name} (${doc.metadata.documentType})\n`;
      request.onEvent({ kind: 'delta', text });
      
      // Add citation
      request.onEvent({
        kind: 'citation',
        citation: {
          id: doc.id,
          label: doc.name,
          href: doc.previewUrl
        }
      });
      
      await this.sleep(100);
    }
  }

  private async extractTerms(
    request: AgentSendRequest,
    routing: IntentRoute
  ): Promise<void> {
    // Get loan package
    const loanPackage = await this.losMCP.getLoanPackage({
      inputLoan: routing.metadata.loanId
    });

    // Extract with LOS connector (includes policy validation)
    const extraction = await this.losMCP.extractLoanTerms({
      termSheetId: loanPackage.termSheetId
    });

    // Stream analysis
    let text = "Extracted loan terms:\n\n";
    request.onEvent({ kind: 'delta', text });

    text += `Amount: $${extraction.amount.toLocaleString()}\n`;
    request.onEvent({ kind: 'delta', text });

    text += `LTV: ${(extraction.ltv * 100).toFixed(1)}%\n`;
    request.onEvent({ kind: 'delta', text });

    text += `DSCR: ${extraction.dscr}x\n\n`;
    request.onEvent({ kind: 'delta', text });

    // Check policy compliance with TypeSafe
    const riskScore = await this.orchestrator.scoreLoanRisk({
      loanData: extraction,
      documents: loanPackage.documents
    });

    if (riskScore.score > 0.7) {
      text += `⚠️ Policy exceptions detected:\n`;
      for (const exception of riskScore.exceptions) {
        text += `• ${exception.field}: ${exception.message}\n`;
        request.onEvent({ kind: 'delta', text });
      }

      // Create HITL proposal
      request.onEvent({
        kind: 'proposal',
        proposal: {
          id: `proposal-${Date.now()}`,
          title: 'Apply terms despite policy exceptions',
          summary: `LTV ${(extraction.ltv * 100).toFixed(1)}% exceeds policy max 80%`,
          params: [
            { label: 'Amount', value: `$${extraction.amount.toLocaleString()}` },
            { label: 'LTV', value: `${(extraction.ltv * 100).toFixed(1)}%` },
            { label: 'DSCR', value: `${extraction.dscr}x` }
          ]
        }
      });
    }

    // Add citation
    request.onEvent({
      kind: 'citation',
      citation: {
        id: loanPackage.termSheetId,
        label: loanPackage.termSheetName,
        href: loanPackage.termSheetPreview
      }
    });
  }

  async resolveAction(
    request: AgentResolveActionRequest
  ): Promise<AgentActionProposal> {
    // Parse proposal ID to get context
    const context = this.parseProposalId(request.proposalId);

    if (request.decision === 'approved') {
      // Apply the terms to Salesforce
      await this.losMCP.applyLoanTerms({
        loanId: context.loanId,
        terms: context.terms,
        confirmed: true
      });

      return {
        id: request.proposalId,
        title: 'Apply terms despite policy exceptions',
        decision: 'approved',
        note: 'Terms applied to loan record'
      };
    } else {
      return {
        id: request.proposalId,
        title: 'Apply terms despite policy exceptions',
        decision: 'rejected',
        note: request.note || 'Terms not applied'
      };
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private parseProposalId(id: string): any {
    // Parse proposal metadata from ID
    return JSON.parse(atob(id.split('-')[1]));
  }
}
```

### Step 2: Update AgentChatInterface.tsx

```typescript
import { MCPTransport } from '../transport/MCPTransport';

export function AgentChatInterface() {
  const [transport] = useState<AgentChatTransport>(() => {
    // Use real transport instead of demo
    return new MCPTransport();
  });

  // Rest of component...
}
```

### Step 3: Environment Configuration

```bash
# .env.local
# TYPESAFE_API_KEY lives in the repo-root .env (see .env.sample), server-side only.
# Never add it as a VITE_ variable: Vite inlines those into the browser bundle.
VITE_BOX_MCP_URL=http://localhost:3000
VITE_LOS_MCP_URL=http://localhost:3001
```

## Demo Flow Integration

### Beat 2: Find Critical Risk Documents

**User Input:** "What's the latest loan for Harborview Logistics? Which documents are flagged critical policy risk?"

**Transport Flow:**
1. TypeSafe routes to `list_loans` + `search_documents` (~750ms)
2. Call LOS MCP `listLoans(borrower='Harborview')` 
3. Call Box MCP `query_metadata(policyRisk='Critical')`
4. Stream results with citations for each document

### Beat 3: Extract & Validate Terms

**User Input:** "Extract loan terms from the marked-up term sheet for that loan and check them against credit policy"

**Transport Flow:**
1. TypeSafe routes to `extract_terms` + `validate_policy` (~550ms)
2. Call LOS MCP `getLoanPackage()`
3. Call LOS MCP `extractLoanTerms()` (includes Box AI + policy validation)
4. TypeSafe scores risk (~580ms)
5. Stream analysis with citations
6. If exceptions found, emit HITL proposal

**Follow-up:** "apply the amount, rate and term to the record, confirm"

**Transport Flow:**
1. User approves the proposal in chat
2. `resolveAction()` called with decision="approved"
3. Call LOS MCP `applyLoanTerms(confirmed=true)`
4. Return updated proposal with note

### Beat 4: Compare Loan History

**User Input:** "Compare the covenant terms across Harborview's prior executed loans and this 2026 markup"

**Transport Flow:**
1. TypeSafe routes to `compare_history` (~550ms)
2. Call LOS MCP `listLoans(borrower='Harborview', status='Closed')`
3. TypeSafe analyzes portfolio trends
4. Stream comparison with document citations

### Beat 5: Generate & Sign

**User Input:** "Generate the commitment letter for this loan and send it for signature"

**Transport Flow:**
1. TypeSafe routes to `generate_letter` + `prepare_signature` (~550ms)
2. Call Box MCP `create_docgen_batch()`
3. Call LOS MCP `prepareSignatureRequest()`
4. Stream confirmation with document citation

## Performance Summary

| Operation | TypeSafe Decision | MCP Call(s) | Total |
|-----------|------------------|-------------|-------|
| Find Docs | 750ms | ~500ms | ~1.25s |
| Extract Terms | 550ms | ~2s | ~2.5s |
| Validate Record | 550ms | ~300ms | ~850ms |
| Compare History | 550ms | ~1s | ~1.5s |
| Generate Letter | 550ms | ~3s | ~3.5s |

TypeSafe adds sub-second orchestration overhead while enabling:
- Confidence-based routing
- Policy exception detection
- Cross-system validation
- Portfolio trend analysis

## Testing

```bash
# Terminal 1: Start chat UI
cd apps/agent-chat
npm run dev

# Terminal 2: Start Box MCP
cd ../../connectors/box-mcp
npm start

# Terminal 3: Start LOS MCP
cd ../los-mcp
npm start

# Terminal 4: Start TypeSafe benchmarks
cd ../box-typesafe-orchestrator
./demo-flow-benchmark.sh
```

Open http://localhost:3003 and try the demo prompts!
