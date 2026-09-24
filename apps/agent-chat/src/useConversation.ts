import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AgentChatController,
  type AgentActionDecision,
  type AgentChatMessage,
} from "@unofficialbox/box-open-elements/patterns/agent-chat";
import { incompleteNotice, newTurn, upsertStep, type TurnDetails } from "./activity";
import type { LoanAgentTransport, LoanContext } from "./transport";

export interface Conversation {
  messages: AgentChatMessage[];
  /** Keyed by the agent message each turn produced. */
  turns: Record<string, TurnDetails>;
  streaming: boolean;
  send: (text: string) => void;
  stop: () => void;
  /** Resolves to an error message, or undefined when the decision landed. */
  resolve: (proposalId: string, decision: AgentActionDecision) => Promise<string | undefined>;
}

/**
 * One conversation on box-open-elements' headless AgentChatController: it owns
 * the messages (text, citations, proposals); this hook adds each turn's side
 * channels (plan, steps, result blocks, next options, timing), keyed by the
 * agent message they belong to. A new session ID starts a new conversation.
 */
export function useConversation(
  transport: LoanAgentTransport,
  sessionId: string,
  onContext: (loan: LoanContext) => void
): Conversation {
  const controller = useMemo(
    () => new AgentChatController({ token: sessionId, transport, agentName: "Loan Copilot" }),
    [transport, sessionId]
  );
  const [messages, setMessages] = useState<AgentChatMessage[]>([]);
  const [turns, setTurns] = useState<Record<string, TurnDetails>>({});
  const [streaming, setStreaming] = useState(false);
  const contextRef = useRef(onContext);
  contextRef.current = onContext;

  useEffect(() => {
    controller.connect();
    setMessages([]);
    setTurns({});
    setStreaming(false);

    // The controller adds the agent message before it calls the transport, so
    // the newest message is the one this turn's side channels belong to.
    let current: string | undefined;
    const patch = (update: (turn: TurnDetails) => TurnDetails) => {
      const id = current;
      if (id) setTurns(all => (all[id] ? { ...all, [id]: update(all[id]) } : all));
    };
    transport.onTurnStart = () => {
      const { messages: now } = controller.getState();
      const id = now[now.length - 1]?.id;
      current = id;
      if (id) setTurns(all => ({ ...all, [id]: newTurn(Date.now()) }));
    };
    transport.onTrace = ({ step }) => patch(turn => ({ ...turn, steps: upsertStep(turn.steps, step) }));
    transport.onTodos = todos => patch(turn => ({ ...turn, todos }));
    transport.onBlock = block => patch(turn => ({ ...turn, blocks: [...turn.blocks, block] }));
    transport.onOptions = options => patch(turn => ({ ...turn, options }));
    transport.onContext = loan => contextRef.current(loan);
    transport.onTurnEnd = summary =>
      patch(turn => ({ ...turn, endedAt: Date.now(), incomplete: incompleteNotice(summary) }));

    const unsubscribe = [
      controller.subscribe("messagesChanged", ({ messages: next }) => setMessages(next)),
      controller.subscribe("streamingChanged", ({ streaming: next }) => setStreaming(next)),
    ];
    return () => {
      for (const off of unsubscribe) off();
      transport.onTurnStart = undefined;
      transport.onTrace = undefined;
      transport.onTodos = undefined;
      transport.onBlock = undefined;
      transport.onOptions = undefined;
      transport.onContext = undefined;
      transport.onTurnEnd = undefined;
      controller.disconnect();
    };
  }, [controller, transport]);

  const send = useCallback((text: string) => void controller.send(text), [controller]);
  const stop = useCallback(() => controller.stop(), [controller]);
  const resolve = useCallback(
    async (proposalId: string, decision: AgentActionDecision) => {
      const resolved = await controller.resolveAction(proposalId, decision);
      return resolved ? undefined : (controller.getState().error ?? "That decision didn't go through. Try again.");
    },
    [controller]
  );

  return { messages, turns, streaming, send, stop, resolve };
}
