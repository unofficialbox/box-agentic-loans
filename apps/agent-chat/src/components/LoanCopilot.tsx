import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { AgentChatMessage } from "@unofficialbox/box-open-elements/patterns/agent-chat";
import type { TurnDetails } from "../activity";
import { STARTER_PROMPTS } from "../prompts";
import { agentBaseUrl, createTransport, type LoanContext } from "../transport";
import { useConversation, type Conversation } from "../useConversation";
import { ApiInspector } from "./ApiInspector";
import { ApprovalCard } from "./ApprovalCard";
import { Composer } from "./Composer";
import { ResultBlocks, documentIds } from "./ResultBlocks";
import { TurnProgress } from "./TurnProgress";
import "./LoanCopilot.css";

const newSessionId = () => `session-${Date.now().toString(36)}`;

/** What the offline demo script is about; live mode shows what the backend reports. */
const DEMO_LOAN: LoanContext = {
  loanId: "LN-2026-0042",
  name: "Harborview Distribution Facility Loan 2026",
  status: "Underwriting",
};

export function LoanCopilot({ loan }: { loan?: string }) {
  const transport = useMemo(() => createTransport(loan), [loan]);
  const [sessionId, setSessionId] = useState(newSessionId);
  const [loanContext, setLoanContext] = useState<LoanContext | null>(null);
  const conversation = useConversation(transport, sessionId, setLoanContext);
  const { streaming } = conversation;
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const ask = useCallback(
    (prompt: string) => {
      conversation.send(prompt);
      inputRef.current?.focus();
    },
    [conversation]
  );

  const newChat = () => {
    setSessionId(newSessionId());
    setLoanContext(null);
    inputRef.current?.focus();
  };

  const isDemo = transport.mode === "demo";
  const baseUrl = agentBaseUrl();
  const shownLoan = isDemo ? DEMO_LOAN : (loanContext ?? (loan ? { loanId: loan } : null));

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
        <Thread conversation={conversation} onAsk={ask} />
        <div className="composer-dock">
          <Composer streaming={streaming} onSend={conversation.send} onStop={conversation.stop} inputRef={inputRef} />
        </div>
      </main>

      {!isDemo && baseUrl && <ApiInspector baseUrl={baseUrl} />}
    </div>
  );
}

function Thread({ conversation, onAsk }: { conversation: Conversation; onAsk: (prompt: string) => void }) {
  const { messages, turns, streaming, resolve } = conversation;
  const threadRef = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);
  const count = useRef(0);

  // Follow new content to the bottom, but only while the officer hasn't
  // scrolled up to read. Intent comes from what they do (wheel, touch, keys,
  // dragging the scrollbar), not from scroll events alone, which also fire
  // when the thread is resized.
  useEffect(() => {
    const thread = threadRef.current;
    if (!thread) return;
    let dragging = false;
    const atBottom = () => thread.scrollHeight - thread.scrollTop - thread.clientHeight < 48;
    const release = () => (pinned.current = false);
    const onWheel = (event: WheelEvent) => event.deltaY < 0 && release();
    const onKey = (event: KeyboardEvent) => ["ArrowUp", "PageUp", "Home"].includes(event.key) && release();
    const onPointerDown = (event: PointerEvent) => (dragging = event.target === thread);
    const onPointerUp = () => (dragging = false);
    const onScroll = () => {
      if (atBottom()) pinned.current = true;
      else if (dragging) release();
    };
    const resize = new ResizeObserver(() => {
      if (pinned.current) thread.scrollTop = thread.scrollHeight;
    });
    resize.observe(thread);
    thread.addEventListener("wheel", onWheel, { passive: true });
    thread.addEventListener("touchmove", release, { passive: true });
    thread.addEventListener("keydown", onKey);
    thread.addEventListener("pointerdown", onPointerDown);
    thread.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("pointerup", onPointerUp);
    return () => {
      resize.disconnect();
      thread.removeEventListener("wheel", onWheel);
      thread.removeEventListener("touchmove", release);
      thread.removeEventListener("keydown", onKey);
      thread.removeEventListener("pointerdown", onPointerDown);
      thread.removeEventListener("scroll", onScroll);
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, []);

  // A new message (the officer's, or a reply starting) always re-pins;
  // streamed content within a reply follows only while pinned.
  useLayoutEffect(() => {
    const thread = threadRef.current;
    if (!thread) return;
    if (messages.length > count.current) pinned.current = true;
    count.current = messages.length;
    if (pinned.current) thread.scrollTop = thread.scrollHeight;
  }, [messages, turns]);

  const lastAgent = [...messages].reverse().find(message => message.role === "agent");
  const awaitingApproval = messages.some(message => message.proposals.some(proposal => !proposal.decision));
  // Nothing competes with a waiting approval: next steps appear once it is decided.
  const next = !streaming && !awaitingApproval && lastAgent ? (turns[lastAgent.id]?.options ?? []) : [];

  return (
    <div className="thread" ref={threadRef} tabIndex={0} role="region" aria-label="Conversation">
      <div className="thread-column">
        {messages.length === 0 ? (
          <Welcome onAsk={onAsk} />
        ) : (
          <>
            {messages.map(message =>
              message.role === "user" ? (
                <div key={message.id} className="message-user">
                  <p>{message.body}</p>
                </div>
              ) : (
                <Reply
                  key={message.id}
                  message={message}
                  turn={turns[message.id]}
                  onResolve={(proposalId, decision) => resolve(proposalId, decision)}
                />
              )
            )}
            {next.length > 0 && (
              <nav className="next" aria-label="Suggested next steps">
                {next.map(({ label, prompt }) => (
                  <button key={label} type="button" className="chip" title={prompt} onClick={() => onAsk(prompt)}>
                    {label}
                  </button>
                ))}
              </nav>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Welcome({ onAsk }: { onAsk: (prompt: string) => void }) {
  return (
    <div className="welcome">
      <h1 className="welcome-title">Ask about a loan</h1>
      <p className="welcome-lede">
        Name a borrower or a loan ID. The copilot reads Box and Salesforce, checks credit policy, and asks before it changes
        anything.
      </p>
      <ul className="starters" aria-label="Suggested prompts">
        {STARTER_PROMPTS.map(prompt => (
          <li key={prompt.id}>
            <button type="button" className="starter" onClick={() => onAsk(prompt.content)}>
              <span className="starter-title">{prompt.title}</span>
              <span className="starter-description">{prompt.description}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

const SOURCES_SHOWN = 3;

/** The reply's references, a few at a time: the answer comes first. */
function Sources({ citations }: { citations: AgentChatMessage["citations"] }) {
  const [all, setAll] = useState(false);
  if (citations.length === 0) return null;
  const hidden = citations.length - SOURCES_SHOWN;
  const shown = all || hidden <= 1 ? citations : citations.slice(0, SOURCES_SHOWN);
  return (
    <div className="sources">
      <span className="sources-label">Sources</span>
      <ul>
        {shown.map(citation => (
          <li key={citation.id}>
            {citation.href ? (
              <a className="source" href={citation.href} target="_blank" rel="noreferrer">
                {citation.label}
              </a>
            ) : (
              <span className="source">{citation.label}</span>
            )}
          </li>
        ))}
      </ul>
      {shown.length < citations.length && (
        <button type="button" className="sources-more" onClick={() => setAll(true)}>
          {hidden} more
        </button>
      )}
    </div>
  );
}

function Reply({
  message,
  turn,
  onResolve,
}: {
  message: AgentChatMessage;
  turn?: TurnDetails;
  onResolve: Conversation["resolve"];
}) {
  const blocks = turn?.blocks ?? [];
  const shownAsDocuments = documentIds(blocks);
  const sources = message.citations.filter(citation => !shownAsDocuments.has(citation.id));
  const paragraphs = message.body.split(/\n{2,}/).filter(part => part.trim());
  const failed = message.status === "error";

  return (
    <article className="reply" aria-busy={message.status === "streaming"}>
      <h2 className="visually-hidden">Loan Copilot</h2>
      {turn && <TurnProgress turn={turn} failed={failed} />}
      {paragraphs.length > 0 && (
        <div className="reply-text">
          {paragraphs.map((paragraph, index) => (
            <p key={index}>{paragraph}</p>
          ))}
        </div>
      )}
      <ResultBlocks blocks={blocks} />
      <Sources citations={sources} />
      {message.proposals.map(proposal => (
        <ApprovalCard key={proposal.id} proposal={proposal} onResolve={decision => onResolve(proposal.id, decision)} />
      ))}
      {failed && (
        <p className="reply-error" role="alert">
          {message.errorMessage ?? "The reply failed."}
        </p>
      )}
      {turn?.incomplete && <p className="reply-warning">{turn.incomplete}</p>}
    </article>
  );
}
