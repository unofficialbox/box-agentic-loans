import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { AgentChatMessage } from "@unofficialbox/box-open-elements/patterns/agent-chat";
import type { TurnDetails } from "../activity";
import { summarize, type ChatSummary } from "../conversations";
import { greeting } from "../greeting";
import { STARTER_PROMPTS } from "../prompts";
import { createTransport, type LoanContext } from "../transport";
import { useConversation, type Conversation } from "../useConversation";
import { ApprovalCard } from "./ApprovalCard";
import { Composer } from "./Composer";
import { ResultBlocks, documentIds } from "./ResultBlocks";
import { TurnProgress } from "./TurnProgress";

/** What the offline demo script is about; live mode shows what the backend reports. */
const DEMO_LOAN: LoanContext = {
  loanId: "LN-2026-0042",
  name: "Harborview Distribution Facility Loan 2026",
  status: "Underwriting",
};

/**
 * One conversation: its own transport, controller and agent session, so it
 * keeps running (and keeps its scroll position) while another is in view.
 * Hidden rather than unmounted when inactive. Reports a summary upward for
 * the sidebars.
 */
export function ChatSession({
  sessionId,
  loanHint,
  active,
  onSummary,
}: {
  sessionId: string;
  loanHint?: string;
  active: boolean;
  onSummary: (sessionId: string, summary: ChatSummary) => void;
}) {
  const transport = useMemo(() => createTransport(loanHint), [loanHint]);
  const [loanContext, setLoanContext] = useState<LoanContext | null>(null);
  const conversation = useConversation(transport, sessionId, setLoanContext);
  const { messages, streaming } = conversation;
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const isDemo = transport.mode === "demo";
  // Memoized: the summary (and the parent's state) changes only when these do.
  const loan = useMemo(
    () => (isDemo ? DEMO_LOAN : (loanContext ?? (loanHint ? { loanId: loanHint } : null))),
    [isDemo, loanContext, loanHint]
  );
  const summary = useMemo(() => summarize(messages, loan, streaming), [messages, loan, streaming]);
  useEffect(() => onSummary(sessionId, summary), [onSummary, sessionId, summary]);

  // Coming into view (a new chat, or picked from the list): ready to type.
  useEffect(() => {
    if (active) inputRef.current?.focus({ preventScroll: true });
  }, [active]);

  const ask = useCallback(
    (prompt: string) => {
      conversation.send(prompt);
      inputRef.current?.focus();
    },
    [conversation]
  );

  return (
    <section className="session" hidden={!active} aria-label={summary.title}>
      <Thread sessionId={sessionId} conversation={conversation} onAsk={ask} />
      <div className="composer-dock">
        <Composer streaming={streaming} onSend={conversation.send} onStop={conversation.stop} inputRef={inputRef} />
      </div>
    </section>
  );
}

function Thread({
  sessionId,
  conversation,
  onAsk,
}: {
  sessionId: string;
  conversation: Conversation;
  onAsk: (prompt: string) => void;
}) {
  const { messages, turns, streaming, resolve } = conversation;
  const threadRef = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);
  const count = useRef(0);
  // New content arrived below while the officer was reading further up.
  const [behind, setBehind] = useState(false);

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
      if (atBottom()) {
        pinned.current = true;
        setBehind(false);
      } else if (dragging) release();
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
    else if (thread.scrollHeight - thread.scrollTop - thread.clientHeight > 48) setBehind(true);
  }, [messages, turns]);

  const jumpToLatest = () => {
    const thread = threadRef.current;
    if (!thread) return;
    pinned.current = true;
    setBehind(false);
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    thread.scrollTo({ top: thread.scrollHeight, behavior: reduce ? "auto" : "smooth" });
  };

  const lastAgent = [...messages].reverse().find(message => message.role === "agent");
  const awaitingApproval = messages.some(message => message.proposals.some(proposal => !proposal.decision));
  // Nothing competes with a waiting approval: next steps appear once it is decided.
  const next = !streaming && !awaitingApproval && lastAgent ? (turns[lastAgent.id]?.options ?? []) : [];

  return (
    <div className="thread-wrap">
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
                    sessionId={sessionId}
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
      {behind && (
        <button type="button" className="jump" onClick={jumpToLatest}>
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
            <path d="M8 3v10M3.75 8.75L8 13l4.25-4.25" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Jump to latest
        </button>
      )}
    </div>
  );
}

function Welcome({ onAsk }: { onAsk: (prompt: string) => void }) {
  return (
    <div className="welcome">
      <h1 className="welcome-title">
        {greeting()}.<span className="welcome-question"> Which loan are we working on?</span>
      </h1>
      <p className="welcome-lede">
        Name a borrower or a loan ID. The copilot reads the loan's documents in Box and its record in Salesforce, checks
        them against credit policy, and asks before it changes anything.
      </p>
      <h2 className="starters-title">Start with</h2>
      <ul className="starters">
        {STARTER_PROMPTS.map(prompt => (
          <li key={prompt.id}>
            <button type="button" className="starter" onClick={() => onAsk(prompt.content)}>
              <span className="starter-title">{prompt.title}</span>
              <span className="starter-description">{prompt.description}</span>
              <span className="starter-go" aria-hidden="true">
                →
              </span>
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
  sessionId,
  message,
  turn,
  onResolve,
}: {
  sessionId: string;
  message: AgentChatMessage;
  turn?: TurnDetails;
  onResolve: Conversation["resolve"];
}) {
  const blocks = turn?.blocks ?? [];
  const shownAsDocuments = documentIds(blocks);
  const sources = message.citations.filter(citation => !shownAsDocuments.has(citation.id));
  const paragraphs = message.body.split(/\n{2,}/).filter(part => part.trim());
  const failed = message.status === "error";
  // A caret marks where text is still arriving; once results start, they carry the motion.
  const typing = message.status === "streaming" && paragraphs.length > 0 && blocks.length === 0;

  return (
    <article className="reply" aria-busy={message.status === "streaming"}>
      <h2 className="visually-hidden">Loan Copilot</h2>
      {turn && <TurnProgress turn={turn} failed={failed} />}
      {paragraphs.length > 0 && (
        <div className="reply-text">
          {paragraphs.map((paragraph, index) => (
            <p key={index}>
              {paragraph}
              {typing && index === paragraphs.length - 1 && <span className="caret" aria-hidden="true" />}
            </p>
          ))}
        </div>
      )}
      <ResultBlocks blocks={blocks} />
      <Sources citations={sources} />
      {message.proposals.map(proposal => (
        <ApprovalCard key={proposal.id} sessionId={sessionId} proposal={proposal} onResolve={decision => onResolve(proposal.id, decision)} />
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
