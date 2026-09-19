import { useState, useEffect, useRef } from "react";
import "./AgentChatInterface.css";
import type {
  AgentChatTransport,
  AgentSendRequest
} from "@unofficialbox/box-open-elements/patterns/agent-chat/types";
import { AgentChat } from "@unofficialbox/box-open-elements";

// Register the custom element
if (!customElements.get('box-agent-chat')) {
  AgentChat.register();
}

interface Document {
  id: string;
  name: string;
  type: string;
}

// Mock transport for demonstration
class DemoTransport implements AgentChatTransport {
  async sendMessage(request: AgentSendRequest): Promise<void> {
    // Simulate streaming response
    const words = [
      "Analyzing",
      "documents",
      "for",
      "risky",
      "terms...",
      "\n\n",
      "I found",
      "several",
      "documents",
      "containing",
      "high-risk",
      "covenant",
      "terms",
      "and",
      "liability",
      "clauses",
      "that",
      "require",
      "review.",
      "\n\n",
      "Key findings:",
      "\n",
      "• Environmental report contains critical policy risks",
      "\n",
      "• Term sheet has LTV ratio exceeding policy limits (85% > 80%)",
      "\n",
      "• DSCR below minimum threshold (1.12x < 1.25x)"
    ];

    for (let i = 0; i < words.length; i++) {
      if (request.signal?.aborted) {
        break;
      }
      await new Promise(resolve => setTimeout(resolve, 100 + Math.random() * 150));
      request.onEvent({ kind: "delta", text: words.slice(0, i + 1).join(" ") });
    }

    // Add citations
    await new Promise(resolve => setTimeout(resolve, 300));
    request.onEvent({
      kind: "citation",
      citation: {
        id: "doc-1",
        label: "harborview-environmental-report-2026.pdf",
        href: "#doc-1"
      }
    });

    await new Promise(resolve => setTimeout(resolve, 200));
    request.onEvent({
      kind: "citation",
      citation: {
        id: "doc-2",
        label: "harborview-term-sheet-2026.pdf",
        href: "#doc-2"
      }
    });
  }
}

export function AgentChatInterface() {
  const [sessionId, setSessionId] = useState<string | null>("session-" + Date.now());
  const [transport] = useState<AgentChatTransport>(new DemoTransport());
  const [selectedAgent] = useState("Box Agent");
  const [isPro, setIsPro] = useState(false);
  const [sourcesCount] = useState(8);
  const [documents] = useState<Document[]>([
    { id: "1", name: "harborview-environmental-report-2026.pdf", type: "pdf" },
    { id: "2", name: "harborview-loan-application-2026.pdf", type: "pdf" },
    { id: "3", name: "harborview-term-sheet-2026.pdf", type: "pdf" },
    { id: "4", name: "harborview-financial-statement-2026.pdf", type: "pdf" },
    { id: "5", name: "harborview-tax-return-2025.pdf", type: "pdf" },
    { id: "6", name: "harborview-appraisal-2026.pdf", type: "pdf" },
    { id: "7", name: "harborview-insurance-policy-2026.pdf", type: "pdf" },
    { id: "8", name: "SKILL.md", type: "markdown" }
  ]);
  const [showHistory, setShowHistory] = useState(false);
  const [sessions] = useState([
    { id: "session-1", title: "Risky Terms in Documents", date: "2026-09-18" },
    { id: "session-2", title: "Portfolio Analysis", date: "2026-09-17" },
    { id: "session-3", title: "Loan Term Validation", date: "2026-09-16" }
  ]);

  const chatRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const chatElement = chatRef.current as any;
    if (chatElement) {
      chatElement.transport = transport;
    }
  }, [transport]);

  const handleNewSession = () => {
    setSessionId("session-" + Date.now());
  };

  return (
    <div className="agent-chat-layout">
      {/* Box Sidebar */}
      <aside className="box-sidebar">
        <div className="box-logo">
          <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
            <rect width="32" height="32" rx="6" fill="#0061D5"/>
            <path d="M16 8L10 12V20L16 24L22 20V12L16 8Z" fill="white" stroke="white" strokeWidth="1.5" strokeLinejoin="round"/>
          </svg>
        </div>
        <nav className="sidebar-nav">
          <button className="nav-item" title="Files">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
              <path d="M4 4C4 2.89543 4.89543 2 6 2H11L14 5H16C17.1046 5 18 5.89543 18 7V16C18 17.1046 17.1046 18 16 18H6C4.89543 18 4 17.1046 4 16V4Z"/>
            </svg>
            <span>Files</span>
          </button>
          <button className="nav-item active" title="AI">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
              <path d="M10 2L14 6L10 10L6 6L10 2ZM10 10L14 14L10 18L6 14L10 10Z"/>
            </svg>
            <span>AI</span>
          </button>
          <button className="nav-item" title="Hubs">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
              <circle cx="10" cy="10" r="2"/>
              <circle cx="4" cy="10" r="2"/>
              <circle cx="16" cy="10" r="2"/>
            </svg>
            <span>Hubs</span>
          </button>
          <button className="nav-item" title="Notes">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
              <path d="M4 4H16V16H4V4ZM6 6V8H14V6H6ZM6 10V12H14V10H6Z"/>
            </svg>
            <span>Notes</span>
          </button>
          <button className="nav-item" title="Sign">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
              <path d="M3 15L7 11L9 13L15 7L17 9V16H3V15Z"/>
            </svg>
            <span>Sign</span>
          </button>
        </nav>
      </aside>

      {/* Main Content */}
      <main className="chat-main">
        {/* Header */}
        <header className="chat-header">
          <button className="history-btn" onClick={() => setShowHistory(!showHistory)}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 2C4.686 2 2 4.686 2 8s2.686 6 6 6 6-2.686 6-6h-2c0 2.21-1.79 4-4 4s-4-1.79-4-4 1.79-4 4-4V2z"/>
            </svg>
            History
          </button>
          {sessionId && (
            <div className="session-title">
              Risky Terms in Documents
            </div>
          )}
          <div className="header-actions">
            <button className="icon-btn" title="Share">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <path d="M12 5L8 1L4 5H7V11H9V5H12Z"/>
              </svg>
            </button>
            <button className="icon-btn" title="More">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <circle cx="8" cy="4" r="1.5"/>
                <circle cx="8" cy="8" r="1.5"/>
                <circle cx="8" cy="12" r="1.5"/>
              </svg>
            </button>
            <button className="new-btn" onClick={handleNewSession}>
              New
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <path d="M8 2L12 6H9V14H7V6H4L8 2Z"/>
              </svg>
            </button>
          </div>
        </header>

        {/* Documents Grid */}
        {sessionId && documents.length > 0 && (
          <div className="documents-grid">
            {documents.map(doc => (
              <div key={doc.id} className="document-card">
                <div className={`doc-icon ${doc.type}`}>
                  {doc.type === "pdf" ? (
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="#D93025">
                      <path d="M7 2H14L18 6V20H6V2H7Z" fill="#D93025"/>
                      <text x="50%" y="70%" fill="white" fontSize="8" fontWeight="bold" textAnchor="middle">PDF</text>
                    </svg>
                  ) : (
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="#FF69B4">
                      <path d="M7 2H14L18 6V20H6V2H7Z"/>
                      <text x="50%" y="70%" fill="white" fontSize="8" fontWeight="bold" textAnchor="middle">MD</text>
                    </svg>
                  )}
                </div>
                <span className="doc-name" title={doc.name}>
                  {doc.name.substring(0, 25)}...
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Chat Area */}
        <div className="chat-container">
          {!sessionId ? (
            <div className="empty-state">
              <div className="agent-icon">
                <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
                  <defs>
                    <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#0061D5" />
                      <stop offset="50%" stopColor="#9B59B6" />
                      <stop offset="100%" stopColor="#E91E63" />
                    </linearGradient>
                  </defs>
                  <circle cx="32" cy="32" r="28" fill="url(#gradient)" opacity="0.2"/>
                  <path d="M32 16L38 22L32 28L26 22L32 16ZM32 28L38 34L32 40L26 34L32 28ZM32 40L38 46L32 52L26 46L32 40Z" fill="url(#gradient)"/>
                </svg>
              </div>
              <h1 className="empty-heading">What can I help you with?</h1>

              <div className="prompt-tabs">
                <button className="tab active">Recent sessions</button>
                <button className="tab">Saved prompts</button>
                <button className="tab">Summarize</button>
                <button className="tab">Research</button>
                <button className="tab">Analyze</button>
                <button className="tab external">
                  Prompt Library
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                    <path d="M10 2L8 4H10V10H4V8L2 10V11H11V2H10Z"/>
                  </svg>
                </button>
              </div>
            </div>
          ) : (
            <div className="agent-chat-wrapper">
              {/* @ts-expect-error - box-agent-chat is a custom element */}
              <box-agent-chat
                ref={chatRef}
                heading="Box Agent"
                agent-name={selectedAgent}
                placeholder="Search or ask Box AI - Use @ to reference people or files"
                token={sessionId}
              />
            </div>
          )}
        </div>

        {/* Input Bar */}
        <div className="input-bar">
          <div className="input-wrapper">
            <textarea
              className="chat-input"
              placeholder="Search or ask Box AI - Use @ to reference people or files"
              rows={1}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  const chatElement = chatRef.current as any;
                  if (chatElement) {
                    chatElement.send(e.currentTarget.value);
                    e.currentTarget.value = '';
                  }
                }
              }}
            />
            <div className="input-controls">
              <button className="control-btn">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M2 4H14V6H2V4ZM2 10H14V12H2V10Z"/>
                </svg>
                {sourcesCount} sources
              </button>
              <button className="control-btn agent-selector">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                  <circle cx="8" cy="8" r="6" fill="#0061D5"/>
                </svg>
                {selectedAgent}
                <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                  <path d="M6 8L3 5H9L6 8Z"/>
                </svg>
              </button>
              <label className="pro-toggle">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M8 2L10 6H14L11 9L12 14L8 11L4 14L5 9L2 6H6L8 2Z"/>
                </svg>
                Pro
                <input
                  type="checkbox"
                  checked={isPro}
                  onChange={(e) => setIsPro(e.target.checked)}
                />
                <span className="toggle-slider"></span>
              </label>
              <button className="send-btn">
                <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M2 2L18 10L2 18V12L12 10L2 8V2Z"/>
                </svg>
              </button>
            </div>
          </div>
          {sessionId && (
            <div className="disclaimer">
              Box AI outputs should be reviewed and verified
            </div>
          )}
        </div>
      </main>

      {/* History Sidebar */}
      {showHistory && (
        <aside className="history-sidebar">
          <div className="history-header">
            <h3>Recent Sessions</h3>
            <button onClick={() => setShowHistory(false)}>×</button>
          </div>
          <div className="history-list">
            {sessions.map(session => (
              <button
                key={session.id}
                className={`history-item ${session.id === sessionId ? 'active' : ''}`}
                onClick={() => setSessionId(session.id)}
              >
                <div className="history-title">{session.title}</div>
                <div className="history-date">{session.date}</div>
              </button>
            ))}
          </div>
        </aside>
      )}
    </div>
  );
}
