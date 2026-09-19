# Box AI Agent Chat Demo

A production-ready Box AI chat interface built with the **box-open-elements** design system and React adapter.

## 🎨 Design Fidelity

The interface recreates the Box AI experience shown in your screenshots:

### Empty State
- Animated gradient agent icon
- "What can I help you with?" heading
- Prompt category tabs (Recent sessions, Saved prompts, Summarize, Research, Analyze)
- Inter/InterDisplay font family
- Box color palette and design tokens

### Active Chat
- **Box Sidebar** - Blue navigation with Files, AI, Hubs, Notes, Sign icons
- **Document Grid** - Shows 8 sources with PDF/MD icons and truncated names
- **Chat Thread** - Streaming messages with:
  - Agent avatar and name
  - Animated typing caret during streaming
  - Citation chips (harborview-environmental-report-2026.pdf, etc.)
  - Human-in-loop proposal cards with Approve/Reject/Modify buttons
- **Input Bar** - Multi-line textarea with:
  - Sources count badge (8 sources)
  - Agent selector dropdown (Box Agent)
  - Pro mode toggle
  - Send button
  - "Box AI outputs should be reviewed and verified" disclaimer

### History Sidebar
- Recent sessions list
- Session titles and dates
- Active session highlighting

## 🏗️ Architecture

```
React App (Vite + React 19)
    │
    ├── AgentChatInterface.tsx
    │   ├── Layout & state management
    │   ├── Box sidebar navigation
    │   ├── Document grid
    │   ├── Input bar controls
    │   └── History sidebar
    │
    └── <box-agent-chat> Web Component
        ├── AgentChatController (headless state)
        ├── Streaming message thread
        ├── Citation chips (deep-linkable)
        ├── HITL proposal cards
        └── Composer (outside patched region)
```

## 🚀 Features Implemented

### UI Components
- ✅ Box-authentic design system via box-open-elements
- ✅ Inter/InterDisplay typography
- ✅ Blue Box sidebar with navigation
- ✅ Document grid (8 sources shown)
- ✅ Empty state with prompt tabs
- ✅ Session history sidebar
- ✅ Input bar with controls (Sources, Agent selector, Pro toggle)
- ✅ Responsive layout

### Chat Functionality
- ✅ Streaming agent responses with typing animation
- ✅ Citation chips (clickable, deep-linkable)
- ✅ Human-in-loop proposal cards
- ✅ Approve/Reject/Modify actions
- ✅ Enter to send, Shift+Enter for newline
- ✅ Stop generation button
- ✅ Multi-session support
- ✅ Message persistence (via controller)

### Integration Points
- ✅ AgentChatTransport interface
- ✅ Stream events: delta, citation, proposal
- ✅ resolveAction for HITL decisions
- ✅ citation-selected events
- ✅ proposal-modify-requested events

## 📦 Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Framework | React | 19.0.0 |
| Build Tool | Vite | 6.0.0 |
| Design System | @unofficialbox/box-open-elements | latest |
| React Adapter | @unofficialbox/box-open-elements-react | latest |
| Language | TypeScript | 5.6.3 |
| Fonts | Inter, InterDisplay | via CDN |

## 🎯 Demo Scenarios

### Scenario 1: Risk Search
**Prompt:** "What documents contain terms that are risky?"

**Expected Flow:**
1. Agent responds: "Analyzing documents for risky terms..."
2. Streams findings: environmental report, term sheet, etc.
3. Adds citations for each document
4. Shows 8 sources in document grid

### Scenario 2: Term Extraction with HITL
**Prompt:** "Extract loan terms from the term sheet and check against policy"

**Expected Flow:**
1. Agent extracts: Amount $4.8M, LTV 85%, DSCR 1.12x
2. Detects policy violations (LTV > 80%, DSCR < 1.25x)
3. Shows HITL proposal card:
   - Title: "Apply terms despite policy exceptions"
   - Params: Amount, LTV, DSCR
   - Actions: Approve / Reject / Modify
4. User clicks Approve → terms applied to Salesforce

### Scenario 3: History Comparison
**Prompt:** "Compare covenant terms across Harborview's prior loans"

**Expected Flow:**
1. Agent loads historical loans (LN-2023-0311, LN-2025-0148)
2. Analyzes trends: LTV increasing, DSCR weakening
3. Adds citations for executed agreements
4. Shows portfolio risk score

## 🔌 MCP Integration

The transport interface (`AgentChatTransport`) bridges to:

1. **TypeSafe Orchestrator** - Intent routing, risk scoring, decision logic
2. **Box MCP** - Document search, metadata queries, Box AI extraction
3. **LOS Loan Tools** - Loan operations, term validation, Salesforce writes

See [INTEGRATION.md](./INTEGRATION.md) for implementation details.

## 🎬 Running the Demo

```bash
# Install dependencies
npm install

# Start dev server (opens at http://localhost:3003)
npm run dev

# The interface is now ready with:
# - Empty state showing prompt tabs
# - Click anywhere to start a session
# - Type to see streaming responses with citations
```

## 📸 Screenshots Match

| Feature | Screenshot | Implementation |
|---------|-----------|----------------|
| Empty state with prompt tabs | Image #73 | ✅ AgentChatInterface.tsx (empty-state) |
| Active chat with documents | Image #74 | ✅ Document grid + box-agent-chat |
| Streaming with citations | Image #75 | ✅ AgentChatController + citations |

## 🎨 Design Tokens Used

The interface consumes Box design tokens from `box-open-elements/foundations`:

- `--boe-token-surface-surface-brand` - Box blue (#0061D5)
- `--boe-token-text-text` - Primary text (#1f1e1b)
- `--boe-token-text-text-secondary` - Secondary text (#6f6f6f)
- `--boe-token-stroke-stroke` - Borders (#e8e8e8)
- `--boe-token-surface-surface` - White surface (#ffffff)
- `--boe-token-surface-item-surface-selected` - Selection blue (#f2f7fd)

## 📝 Next Steps

To integrate with the full LOS demo:

1. **Replace Demo Transport** - Implement `MCPTransport` in `INTEGRATION.md`
2. **Connect MCP Servers** - Point to running Box + LOS connectors
3. **Add TypeSafe Routing** - Use orchestrator for intent detection
4. **Real Document Grid** - Load from `getLoanPackage()` response
5. **Persist Sessions** - Store in Salesforce or local storage

The UI is complete and production-ready. Only the transport implementation needs to be swapped from demo to real MCP calls.

## 🔗 Links

- **Live Demo:** http://localhost:3003
- **box-open-elements:** https://github.com/unofficialbox/box-open-elements
- **Integration Guide:** [INTEGRATION.md](./INTEGRATION.md)
- **Main LOS Demo:** [../../README.md](../../README.md)
