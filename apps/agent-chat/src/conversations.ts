import type {
  AgentActionDecision,
  AgentChatMessage,
  AgentCitation,
} from "@unofficialbox/box-open-elements/patterns/agent-chat";
import type { LoanContext } from "./transport";

/** One governed action proposed in a conversation, and where its card is. */
export interface ApprovalSummary {
  id: string;
  title: string;
  decision?: AgentActionDecision;
}

/** What the sidebars show about a conversation, without holding its messages. */
export interface ChatSummary {
  title: string;
  loan: LoanContext | null;
  streaming: boolean;
  started: boolean;
  approvals: ApprovalSummary[];
  sources: AgentCitation[];
}

export const EMPTY_SUMMARY: ChatSummary = {
  title: "New chat",
  loan: null,
  streaming: false,
  started: false,
  approvals: [],
  sources: [],
};

const TITLE_LENGTH = 48;

/** The officer's first message, cut at a word near 48 characters; "New chat" until then. */
export function chatTitle(messages: AgentChatMessage[]): string {
  const first = messages.find(message => message.role === "user")?.body.trim().replace(/\s+/g, " ");
  if (!first) return EMPTY_SUMMARY.title;
  if (first.length <= TITLE_LENGTH) return first;
  const cut = first.slice(0, TITLE_LENGTH);
  const space = cut.lastIndexOf(" ");
  return `${(space > TITLE_LENGTH / 2 ? cut.slice(0, space) : cut).replace(/[\s,.;:?!]+$/, "")}…`;
}

/** Every citation in the conversation, once each, in the order first cited. */
export function collectSources(messages: AgentChatMessage[]): AgentCitation[] {
  const seen = new Map<string, AgentCitation>();
  for (const message of messages) {
    for (const citation of message.citations) {
      if (!seen.has(citation.id)) seen.set(citation.id, citation);
    }
  }
  return [...seen.values()];
}

/** Every proposal in the conversation, oldest first, with its decision once made. */
export function collectApprovals(messages: AgentChatMessage[]): ApprovalSummary[] {
  return messages.flatMap(message =>
    message.proposals.map(({ id, title, decision }) => ({ id, title, ...(decision ? { decision } : {}) }))
  );
}

export function summarize(
  messages: AgentChatMessage[],
  loan: LoanContext | null,
  streaming: boolean
): ChatSummary {
  return {
    title: chatTitle(messages),
    loan,
    streaming,
    started: messages.length > 0,
    approvals: collectApprovals(messages),
    sources: collectSources(messages),
  };
}

/**
 * The DOM id of a proposal's card, so the details panel can jump to it.
 * Scoped by conversation: every chat stays mounted, and proposal IDs are only
 * unique within one (the demo transport numbers each chat's from 1).
 */
export function proposalAnchor(sessionId: string, proposalId: string): string {
  return `proposal-${`${sessionId}-${proposalId}`.replace(/[^A-Za-z0-9_-]/g, "-")}`;
}
