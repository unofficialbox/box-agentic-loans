import { describe, expect, it } from "vitest";
import type { AgentStreamEvent } from "@unofficialbox/box-open-elements/patterns/agent-chat";
import { DEMO_BEATS, routeIntent } from "../src/transport/demoScript";
import { PROMPT_LIBRARY, promptById } from "../src/prompts";
import { DemoLoanAgentTransport } from "../src/transport/demoTransport";
import type { TraceEvent } from "../src/transport/types";

const instant = { chunkMs: 0, stepMs: 0 };

async function runTurn(prompt: string) {
  const transport = new DemoLoanAgentTransport(instant);
  const events: AgentStreamEvent[] = [];
  const trace: TraceEvent[] = [];
  let turns = 0;
  transport.onTurnStart = () => turns++;
  transport.onTrace = event => trace.push(event);
  await transport.sendMessage({ body: prompt, token: "t", onEvent: event => events.push(event) });
  return { transport, events, trace, turns };
}

describe("routeIntent", () => {
  it("routes every library prompt to the beat that handles it", () => {
    const routed = Object.fromEntries(PROMPT_LIBRARY.map(prompt => [prompt.id, routeIntent(prompt.content).beat.intent]));
    expect(routed).toEqual({
      "find-risk": "search_documents",
      "list-closed": "list_loans",
      "extract-check": "extract_terms",
      "validate-record": "validate_record",
      "compare-history": "review_history",
      "commitment-letter": "generate_letter",
      "apply-terms": "update_record",
      "send-signature": "send_for_signature",
    });
  });

  it("offers only next steps that exist in the library", () => {
    const ids = new Set(PROMPT_LIBRARY.map(prompt => prompt.id));
    for (const beat of DEMO_BEATS) {
      expect(beat.next.every(id => ids.has(id)), beat.intent).toBe(true);
    }
  });

  it("falls back to help with zero confidence", () => {
    const { beat, confidence } = routeIntent("hello there");
    expect(beat.intent).toBe("help");
    expect(confidence).toBe(0);
  });
});

describe("DemoLoanAgentTransport", () => {
  it("streams incremental deltas that rebuild the scripted reply exactly", async () => {
    const { events, turns } = await runTurn(promptById("find-risk").content);
    const body = events
      .filter(event => event.kind === "delta")
      .map(event => (event.kind === "delta" ? event.text : ""))
      .join("");
    expect(body).toBe(DEMO_BEATS[0].reply);
    expect(turns).toBe(1);
  });

  it("traces routing then each tool, each running before it settles", async () => {
    const { trace } = await runTurn(promptById("extract-check").content);
    const settled = trace.filter(event => event.step.status !== "running").map(event => event.step.id);
    expect(settled).toEqual(["route", "tool-0", "tool-1"]);
    expect(trace[0].step.status).toBe("running");
  });

  it("holds governed writes as a proposal and resolves them once", async () => {
    const { transport, events, trace } = await runTurn(promptById("apply-terms").content);
    const proposal = events.find(event => event.kind === "proposal");
    expect(proposal?.kind).toBe("proposal");
    if (proposal?.kind !== "proposal") return;
    expect(trace[trace.length - 1]?.step).toMatchObject({ title: "Held for approval · applyLoanTerms", status: "succeeded" });

    const resolved = await transport.resolveAction({
      proposalId: proposal.proposal.id,
      decision: "approved",
      token: "t",
    });
    expect(resolved.decision).toBe("approved");
    expect(resolved.note).toMatch(/demo mode/);

    await expect(
      transport.resolveAction({ proposalId: proposal.proposal.id, decision: "approved", token: "t" })
    ).rejects.toThrow(/Unknown proposal/);
  });

  it("stops streaming when aborted", async () => {
    const transport = new DemoLoanAgentTransport(instant);
    const controller = new AbortController();
    controller.abort();
    const events: AgentStreamEvent[] = [];
    await transport.sendMessage({
      body: promptById("find-risk").content,
      token: "t",
      signal: controller.signal,
      onEvent: event => events.push(event),
    });
    expect(events).toEqual([]);
  });

  it("streams the plan, then offers next steps and reports how the turn ended", async () => {
    const transport = new DemoLoanAgentTransport(instant);
    const plans: string[][] = [];
    const options: string[][] = [];
    const ends: unknown[] = [];
    transport.onTodos = todos => plans.push(todos.map(todo => todo.status));
    transport.onOptions = next => options.push(next.map(option => option.label));
    transport.onTurnEnd = summary => ends.push(summary);

    await transport.sendMessage({ body: promptById("extract-check").content, token: "t", onEvent: () => {} });
    expect(plans[0]).toEqual(["in_progress", "pending", "pending", "pending"]);
    expect(plans[plans.length - 1]).toEqual(["completed", "completed", "completed", "completed"]);
    expect(options).toEqual([["Validate record", "Compare history"]]);
    expect(ends).toEqual([{ status: "complete", missing: [] }]);

    await transport.sendMessage({ body: promptById("apply-terms").content, token: "t", onEvent: () => {} });
    expect(ends[1]).toEqual({ status: "needs_input", missing: [] });
  });
});
