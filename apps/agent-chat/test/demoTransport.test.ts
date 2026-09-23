import { describe, expect, it } from "vitest";
import type { AgentStreamEvent } from "@unofficialbox/box-open-elements/patterns/agent-chat";
import { DEMO_BEATS, SUGGESTED_PROMPTS, routeIntent } from "../src/transport/demoScript";
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
  it("routes every clickpath prompt to its own beat", () => {
    const intents = SUGGESTED_PROMPTS.map(({ prompt }) => routeIntent(prompt).beat.intent);
    expect(intents).toEqual([
      "search_documents",
      "extract_terms",
      "validate_record",
      "update_record",
      "review_history",
      "generate_letter",
    ]);
  });

  it("falls back to help with zero confidence", () => {
    const { beat, confidence } = routeIntent("hello there");
    expect(beat.intent).toBe("help");
    expect(confidence).toBe(0);
  });
});

describe("DemoLoanAgentTransport", () => {
  it("streams incremental deltas that rebuild the scripted reply exactly", async () => {
    const { events, turns } = await runTurn(SUGGESTED_PROMPTS[0].prompt);
    const body = events
      .filter(event => event.kind === "delta")
      .map(event => (event.kind === "delta" ? event.text : ""))
      .join("");
    expect(body).toBe(DEMO_BEATS[0].reply);
    expect(turns).toBe(1);
  });

  it("traces routing then each tool, each running before it settles", async () => {
    const { trace } = await runTurn(SUGGESTED_PROMPTS[1].prompt);
    const settled = trace.filter(event => event.step.status !== "running").map(event => event.step.id);
    expect(settled).toEqual(["route", "tool-0", "tool-1"]);
    expect(trace[0].step.status).toBe("running");
  });

  it("holds governed writes as a proposal and resolves them once", async () => {
    const { transport, events, trace } = await runTurn(SUGGESTED_PROMPTS[3].prompt);
    const proposal = events.find(event => event.kind === "proposal");
    expect(proposal?.kind).toBe("proposal");
    if (proposal?.kind !== "proposal") return;
    expect(trace[trace.length - 1]?.step.status).toBe("warning");

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
      body: SUGGESTED_PROMPTS[0].prompt,
      token: "t",
      signal: controller.signal,
      onEvent: event => events.push(event),
    });
    expect(events).toEqual([]);
  });
});
