import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "@unofficialbox/box-open-elements/agent-chat";
import type { AgentChat, AgentChatMessage } from "@unofficialbox/box-open-elements/patterns/agent-chat";
import type { RunStep } from "@unofficialbox/box-open-elements";
import { STARTER_PROMPTS } from "../prompts";
import {
  agentBaseUrl,
  createTransport,
  type LoanContext,
  type PromptOption,
  type Todo,
  type TraceEvent,
  type TurnSummary,
} from "../transport";
import { ApiInspector } from "./ApiInspector";
import { applyChatTheme } from "./chatTheme";
import { TurnActivity } from "./TurnActivity";
import "./LoanCopilot.css";

const newSessionId = () => `session-${Date.now().toString(36)}`;

/** What the offline demo script is about; live mode shows what the backend reports. */
const DEMO_LOAN: LoanContext = {
  loanId: "LN-2026-0042",
  name: "Harborview Distribution Facility Loan 2026",
  status: "Underwriting",
};


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
  const [notice, setNotice] = useState<string | null>(null);
  const [loanContext, setLoanContext] = useState<LoanContext | null>(null);

  const chatRef = useRef<AgentChat>(null);

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
    applyChatTheme(chat);

    // Follow new content (streamed text, an approval card) to the bottom, but only
    // while the officer hasn't scrolled up to read history. Intent comes from what
    // they do (wheel, touch, keys, dragging the scrollbar), not from scroll events
    // alone: those also fire, a frame late, when the thread is resized.
    const thread = () => chat.shadowRoot?.querySelector<HTMLElement>('[part="thread"]') ?? null;
    const atBottom = (el: HTMLElement) => el.scrollHeight - el.scrollTop - el.clientHeight < 48;
    let pinned = true;
    let dragging = false;
    const inThread = (event: Event) => event.composedPath().includes(thread() as EventTarget);
    const onWheel = (event: WheelEvent) => {
      if (inThread(event) && event.deltaY < 0) pinned = false;
    };
    const onTouch = (event: TouchEvent) => {
      if (inThread(event)) pinned = false;
    };
    const onKey = (event: KeyboardEvent) => {
      if (inThread(event) && ["ArrowUp", "PageUp", "Home"].includes(event.key)) pinned = false;
    };
    const onPointerDown = (event: PointerEvent) => {
      dragging = event.composedPath()[0] === thread();
    };
    const onPointerUp = () => {
      dragging = false;
    };
    const onScroll = () => {
      const el = thread();
      if (!el) return;
      if (atBottom(el)) pinned = true;
      else if (dragging) pinned = false;
    };
    // Opening the inspector or resizing the window shrinks the thread: stay pinned.
    const resize = new ResizeObserver(() => follow());
    let watched: HTMLElement | null = null;
    const follow = () =>
      requestAnimationFrame(() => {
        const el = thread();
        if (el && el !== watched) {
          if (watched) resize.unobserve(watched);
          resize.observe(el);
          watched = el;
        }
        if (el && pinned) el.scrollTop = el.scrollHeight;
      });
    const root = chat.shadowRoot;
    root?.addEventListener("scroll", onScroll, true);
    root?.addEventListener("wheel", onWheel as EventListener, { passive: true });
    root?.addEventListener("touchmove", onTouch as EventListener, { passive: true });
    root?.addEventListener("keydown", onKey as EventListener);
    root?.addEventListener("pointerdown", onPointerDown as EventListener);
    window.addEventListener("pointerup", onPointerUp);

    // A new message (the officer's, or the agent's reply starting) always re-pins;
    // streamed text within a message follows only if already pinned.
    let count = 0;
    const onMessages = (event: Event) => {
      const next = (event as CustomEvent<{ messages: AgentChatMessage[] }>).detail.messages;
      if (next.length > count) pinned = true;
      count = next.length;
      setMessages(next);
      follow();
    };
    const onModify = () =>
      setNotice("To change a proposal, reply with the new values, e.g. “apply the rate at 6.75% instead”.");
    const onResolved = () => setNotice(null);

    chat.addEventListener("messages-changed", onMessages);
    chat.addEventListener("proposal-modify-requested", onModify);
    chat.addEventListener("action-resolved", onResolved);
    return () => {
      resize.disconnect();
      root?.removeEventListener("scroll", onScroll, true);
      root?.removeEventListener("wheel", onWheel as EventListener);
      root?.removeEventListener("touchmove", onTouch as EventListener);
      root?.removeEventListener("keydown", onKey as EventListener);
      root?.removeEventListener("pointerdown", onPointerDown as EventListener);
      window.removeEventListener("pointerup", onPointerUp);
      chat.removeEventListener("messages-changed", onMessages);
      chat.removeEventListener("proposal-modify-requested", onModify);
      chat.removeEventListener("action-resolved", onResolved);
    };
  }, [transport]);

  const ask = useCallback((prompt: string) => {
    void chatRef.current?.send(prompt);
  }, []);

  const newChat = () => {
    setSessionId(newSessionId());
    setSteps([]);
    setTodos([]);
    setNextOptions(null);
    setMessages([]);
    setNotice(null);
    setLoanContext(null);
  };

  const isDemo = transport.mode === "demo";
  const baseUrl = agentBaseUrl();
  const started = messages.length > 0;
  const shownLoan = isDemo ? DEMO_LOAN : (loanContext ?? (loan ? { loanId: loan } : null));
  const awaitingApproval = messages.some(message => message.proposals.some(proposal => !proposal.decision));
  // Nothing competes with a waiting approval: next steps appear once it is decided.
  const chips = started && !awaitingApproval ? (nextOptions ?? []) : [];

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
              <span className="loan-meta">
                {shownLoan.loanId}
                {shownLoan.status && (
                  <>
                    <span aria-hidden="true"> · </span>
                    {shownLoan.status}
                  </>
                )}
              </span>
            </>
          ) : null}
        </div>
        <div className="topbar-actions">
          {isDemo && (
            <span className="mode-demo" title="Scripted replies; no Box or Salesforce calls. Set VITE_AGENT_API_URL for a live agent.">
              Demo script
            </span>
          )}
          <button type="button" className="button" onClick={newChat}>
            New chat
          </button>
        </div>
      </header>

      <main className="workspace">
        <section className={`conversation ${started ? "" : "is-empty"}`} aria-label="Conversation">
          {!started && (
            <div className="welcome">
              <h1 className="welcome-title">Ask about a loan</h1>
              <p className="welcome-lede">
                Name a borrower or a loan ID. The copilot reads Box and Salesforce, checks credit policy, and asks before it
                changes anything.
              </p>
              <ul className="starters" aria-label="Suggested prompts">
                {STARTER_PROMPTS.map(prompt => (
                  <li key={prompt.id}>
                    <button type="button" className="starter" onClick={() => ask(prompt.content)}>
                      <span className="starter-title">{prompt.title}</span>
                      <span className="starter-description">{prompt.description}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <box-agent-chat
            ref={chatRef}
            heading="Conversation"
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
          {chips.length > 0 && (
            <nav className="suggestions" aria-label="Next steps">
              <span className="suggestions-label">Next</span>
              {chips.map(({ label, prompt }) => (
                <button key={label} type="button" className="chip" title={prompt} onClick={() => ask(prompt)}>
                  {label}
                </button>
              ))}
            </nav>
          )}
        </section>

        <aside className="rail" aria-label="Turn details">
          <TurnActivity todos={todos} steps={steps} awaitingApproval={awaitingApproval} isDemo={isDemo} />
        </aside>
      </main>

      {!isDemo && baseUrl && <ApiInspector baseUrl={baseUrl} />}

    </div>
  );
}
