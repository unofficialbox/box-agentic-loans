# Box AI Agent Chat

A Box AI-inspired chat interface built with:
- **React 19** for UI
- **box-open-elements** Web Components for the chat interface
- **box-open-elements-react** adapter for React integration
- **Vite** for dev server and build

## Features

- 🎨 Box-style design with authentic UI elements
- 💬 Streaming agent responses with citations
- 📄 Document grid showing context sources
- 🔄 Session history management
- 🎯 Agent selection and Pro mode toggle
- 📱 Responsive layout

## Architecture

```
┌─────────────────────────────────────────────┐
│  React App (Vite)                          │
│                                             │
│  ┌──────────────────────────────────────┐  │
│  │  AgentChatInterface.tsx              │  │
│  │  - Layout & State Management         │  │
│  │  - Document Grid                     │  │
│  │  - Input Bar Controls                │  │
│  └──────────────────────────────────────┘  │
│                    │                        │
│                    ▼                        │
│  ┌──────────────────────────────────────┐  │
│  │  <box-agent-chat>                    │  │
│  │  Web Component from box-open-elements│  │
│  │  - Streaming message thread          │  │
│  │  - Citation chips                    │  │
│  │  - Human-in-loop proposals           │  │
│  └──────────────────────────────────────┘  │
│                    │                        │
│                    ▼                        │
│  ┌──────────────────────────────────────┐  │
│  │  AgentChatTransport                  │  │
│  │  - sendMessage() streams events      │  │
│  │  - resolveAction() for HITL          │  │
│  └──────────────────────────────────────┘  │
└─────────────────────────────────────────────┘
```

## Getting Started

```bash
# Install dependencies
npm install

# Start dev server (opens at http://localhost:3003)
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

## Integration with LOS Demo

This chat interface can be integrated with the LOS demo's MCP connectors:

1. **Box MCP** - Document search, Box AI extraction, metadata queries
2. **LOS Loan Tools** - Loan operations, term validation, policy checks
3. **TypeSafe Orchestrator** - Decision routing, risk scoring

See the main demo's `CLAUDE.md` for the connector strategy.

## Component Reference

### AgentChatInterface

Main React component managing:
- Box sidebar navigation
- Document grid display
- Chat container with box-agent-chat element
- Input bar with controls
- History sidebar

### box-agent-chat Element

Web Component from `@unofficialbox/box-open-elements/patterns/agent-chat`:

**Properties:**
- `heading` - Panel heading text
- `agent-name` - Display name on agent bubbles
- `placeholder` - Input placeholder text
- `token` - Auth token for transport
- `transport` - AgentChatTransport implementation
- `chatController` - Optional external controller

**Events:**
- `citation-selected` - User clicked a citation chip
- `action-resolved` - Proposal approved/rejected
- `proposal-modify-requested` - User wants to modify proposal

**Methods:**
- `send(body?)` - Send user message
- `stop()` - Stop streaming generation

## Customization

### Transport Implementation

Create a custom transport to connect to your backend:

```typescript
class MyTransport implements AgentChatTransport {
  async sendMessage(request: AgentSendRequest): Promise<void> {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${request.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ message: request.body }),
      signal: request.signal
    });

    const reader = response.body?.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader!.read();
      if (done) break;

      const chunk = decoder.decode(value);
      const events = chunk.split('\n').filter(Boolean);

      for (const eventData of events) {
        const event = JSON.parse(eventData);
        request.onEvent(event);
      }
    }
  }

  async resolveAction(request: AgentResolveActionRequest): Promise<AgentActionProposal> {
    const response = await fetch('/api/resolve', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${request.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(request)
    });

    return response.json();
  }
}
```

### Styling

The interface uses Box design tokens from `box-open-elements/foundations`. Customize via:

1. **CSS custom properties** - Override `--boe-token-*` variables
2. **Component CSS** - Modify `AgentChatInterface.css`
3. **Theme controller** - Use `createThemeController()` for programmatic theming

## License

See main repository LICENSE.
