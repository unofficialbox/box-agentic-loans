import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "@unofficialbox/box-open-elements/agent-chat";
import "@unofficialbox/box-open-elements/run-trace";
import type {
  AgentChat,
  AgentChatMessage,
  AgentCitation,
} from "@unofficialbox/box-open-elements/patterns/agent-chat";
import type { RunStep, RunTrace } from "@unofficialbox/box-open-elements";
import { STARTER_PROMPTS } from "../prompts";
import {
  createTransport,
  type LoanContext,
  type PromptOption,
  type Todo,
  type TraceEvent,
  type TurnSummary,
} from "../transport";
import { PromptLibrary } from "./PromptLibrary";
import "./LoanCopilot.css";

const newSessionId = () => `session-${Date.now().toString(36)}`;

/** What the offline demo script is about; live mode shows what the backend reports. */
const DEMO_LOAN: LoanContext = {
  loanId: "LN-2026-0042",
  name: "Harborview Distribution Facility Loan 2026",
  status: "Underwriting",
};

const STARTERS: PromptOption[] = STARTER_PROMPTS.map(prompt => ({ label: prompt.title, prompt: prompt.content }));

function incompleteNotice(summary: TurnSummary): string | null {
  if (summary.status === "incomplete") {
    return "The reply stopped before the agent finished, so it may be incomplete.";
  }
  if (summary.missing.length) {
    const n = summary.missing.length;
    return `${n} part${n === 1 ? "" : "s"} of that reply didn't arrive, so it may be incomplete. Ask again to be sure.`;
  }
  return null;
}

export function LoanCopilot({ loan }: { loan?: string }) {
  const transport = useMemo(() => createTransport(loan), [loan]);
  const [sessionId, setSessionId] = useState(newSessionId);
  const [steps, setSteps] = useState<RunStep[]>([]);
  const [todos, setTodos] = useState<Todo[]>([]);
  const [nextOptions, setNextOptions] = useState<PromptOption[] | null>(null);
  const [messages, setMessages] = useState<AgentChatMessage[]>([]);
  const [selectedSource, setSelectedSource] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loanContext, setLoanContext] = useState<LoanContext | null>(null);
  const [libraryOpen, setLibraryOpen] = useState(false);

  const chatRef = useRef<AgentChat>(null);
  const traceRef = useRef<RunTrace>(null);

  useEffect(() => {
    transport.onTurnStart = () => {
      setSteps([]);
      setTodos([]);
      setNextOptions(null);
      setNotice(null);
    };
    transport.onContext = setLoanContext;
    transport.onTodos = setTodos;
    transport.onOptions = setNextOptions;
    transport.onTurnEnd = summary => {
      const message = incompleteNotice(summary);
      if (message) setNotice(message);
    };
    // Trace steps replace by id, so a step can move running → succeeded.
    transport.onTrace = ({ step }: TraceEvent) =>
      setSteps(current => {
        const index = current.findIndex(entry => entry.id === step.id);
        return index === -1 ? [...current, step] : current.map((entry, i) => (i === index ? step : entry));
      });
    return () => {
      transport.onTurnStart = undefined;
      transport.onTrace = undefined;
      transport.onContext = undefined;
      transport.onTodos = undefined;
      transport.onOptions = undefined;
      transport.onTurnEnd = undefined;
    };
  }, [transport]);

  useEffect(() => {
    const chat = chatRef.current;
    if (!chat) {
      return;
    }
    chat.transport = transport;

    const onMessages = (event: Event) =>
      setMessages((event as CustomEvent<{ messages: AgentChatMessage[] }>).detail.messages);
    const onCitation = (event: Event) =>
      setSelectedSource((event as CustomEvent<{ citation: AgentCitation }>).detail.citation.id);
    const onModify = () =>
      setNotice("To change a proposal, reply with the new values, e.g. “apply the rate at 6.75% instead”.");
    const onResolved = () => setNotice(null);

    chat.addEventListener("messages-changed", onMessages);
    chat.addEventListener("citation-selected", onCitation);
    chat.addEventListener("proposal-modify-requested", onModify);
    chat.addEventListener("action-resolved", onResolved);
    return () => {
      chat.removeEventListener("messages-changed", onMessages);
      chat.removeEventListener("citation-selected", onCitation);
      chat.removeEventListener("proposal-modify-requested", onModify);
      chat.removeEventListener("action-resolved", onResolved);
    };
  }, [transport]);

  useEffect(() => {
    if (traceRef.current) {
      traceRef.current.steps = steps;
    }
  }, [steps]);

  const sources = useMemo(() => {
    const seen = new Map<string, AgentCitation>();
    for (const message of messages) {
      for (const citation of message.citations) {
        seen.set(citation.id, citation);
      }
    }
    return [...seen.values()];
  }, [messages]);

  const ask = useCallback((prompt: string) => {
    setLibraryOpen(false);
    void chatRef.current?.send(prompt);
  }, []);

  const newChat = () => {
    setSessionId(newSessionId());
    setSteps([]);
    setTodos([]);
    setNextOptions(null);
    setMessages([]);
    setSelectedSource(null);
    setNotice(null);
    setLoanContext(null);
  };

  const isDemo = transport.mode === "demo";
  const started = messages.length > 0;
  const shownLoan = isDemo ? DEMO_LOAN : (loanContext ?? (loan ? { loanId: loan } : null));
  const chips = nextOptions ?? STARTERS;
  const doneCount = todos.filter(todo => todo.status === "completed").length;

  return (
    <div className="copilot">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
              <path d="M12 2.5l2.1 6.4 6.4 2.1-6.4 2.1L12 19.5l-2.1-6.4L3.5 11l6.4-2.1z" />
            </svg>
          </span>
          <div>
            <p className="brand-name">Acme Bank</p>
            <p className="brand-product">Loan Copilot</p>
          </div>
        </div>
        <div className="loan-context" aria-label="Current loan">
          {shownLoan ? (
            <>
              {shownLoan.name && <span className="loan-title">{shownLoan.name}</span>}
              <span className="pill">{shownLoan.loanId}</span>
              {shownLoan.status && <span className="pill">{shownLoan.status}</span>}
              {isDemo && <span className="pill pill-risk">Risk: High</span>}
            </>
          ) : (
            <span className="loan-title loan-title-empty">No loan selected. Name a borrower or loan ID.</span>
          )}
        </div>
        <div className="topbar-actions">
          <span
            className={`mode ${isDemo ? "mode-demo" : "mode-live"}`}
            title={
              isDemo
                ? "Scripted replies; no Box or Salesforce calls. Set VITE_AGENT_API_URL for a live agent."
                : "Connected to the loan agent backend"
            }
          >
            {isDemo ? "Demo script" : "Live agent"}
          </span>
          <button type="button" className="button" onClick={newChat}>
            New chat
          </button>
        </div>
      </header>

      <main className="workspace">
        <section className="conversation" aria-label="Conversation">
          <box-agent-chat
            ref={chatRef}
            heading="Ask about this loan"
            agent-name="Loan Copilot"
            placeholder="Ask about documents, terms, policy, or history…"
            token={sessionId}
          />
          {notice && (
            <p className="notice" role="status">
              {notice}
              <button type="button" className="notice-dismiss" onClick={() => setNotice(null)} aria-label="Dismiss">
                ×
              </button>
            </p>
          )}
          <nav className="suggestions" aria-label={started ? "Next steps" : "Suggested prompts"}>
            <span className="suggestions-label">{started && nextOptions ? "Next" : "Try"}</span>
            {chips.map(({ label, prompt }) => (
              <button key={label} type="button" className="chip" title={prompt} onClick={() => ask(prompt)}>
                {label}
              </button>
            ))}
            <button type="button" className="chip chip-library" onClick={() => setLibraryOpen(true)}>
              Prompt library
            </button>
          </nav>
        </section>

        <aside className="rail" aria-label="Turn details">
          {todos.length > 0 && (
            <section className="card" aria-labelledby="plan-title">
              <div className="card-heading">
                <h2 className="card-title" id="plan-title">
                  Plan
                </h2>
                <span className="card-count">
                  {doneCount} of {todos.length}
                </span>
              </div>
              <ol className="todos">
                {todos.map(todo => (
                  <li key={todo.id} className={`todo todo-${todo.status}`}>
                    <span className="todo-mark" aria-hidden="true" />
                    <span className="todo-text">{todo.content}</span>
                    <span className="visually-hidden">, {todo.status.replace("_", " ")}</span>
                  </li>
                ))}
              </ol>
            </section>
          )}

          <section className="card">
            <h2 className="card-title">Decision trace</h2>
            <p className="card-hint">
              {isDemo ? "Routing is simulated in demo mode." : "TypeSafe routing, tool calls, and approval gates."}
            </p>
            {steps.length > 0 ? (
              <box-run-trace ref={traceRef} heading="This turn" />
            ) : (
              <p className="empty">Each reply shows how it was routed and which tools ran.</p>
            )}
          </section>

          <section className="card">
            <h2 className="card-title">Sources</h2>
            {sources.length > 0 ? (
              <ul className="sources">
                {sources.map(source => (
                  <li key={source.id}>
                    <button
                      type="button"
                      className={`source ${selectedSource === source.id ? "is-selected" : ""}`}
                      aria-pressed={selectedSource === source.id}
                      onClick={() => setSelectedSource(source.id)}
                    >
                      <span className="source-icon" aria-hidden="true" />
                      {source.label}
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="empty">Documents and policies the copilot cites appear here.</p>
            )}
          </section>
        </aside>
      </main>

      <PromptLibrary open={libraryOpen} onClose={() => setLibraryOpen(false)} onPick={ask} />
    </div>
  );
}
