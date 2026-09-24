import { describe, expect, it } from "vitest";
import type { AgentEvent, Proposal } from "../src/contract.js";
import { LoanAgent, policySummary } from "../src/engine.js";
import { FixtureToolGateway } from "../src/fixtures.js";
import type { PolicyFinding } from "../src/policy.js";
import { ActionRequiredError } from "../src/tools.js";
import { TypeSafeError, type ChoiceDecision, type Decider } from "../src/typesafe.js";
import { INTENTS, type Intent } from "../src/understand.js";

const CLICKPATH: Array<[string, Intent]> = [
  ["What's the latest loan for Harborview Logistics? Which documents in that loan are flagged critical policy risk?", "find_risk_documents"],
  ["Extract loan terms from the marked-up term sheet for that loan and check them against credit policy.", "extract_and_check"],
  ["Validate those terms against the Salesforce record.", "validate_record"],
  ["apply the amount, rate and term to the record, confirm", "apply_terms"],
  ["Compare the covenant terms across Harborview's prior executed loans and this 2026 markup.", "compare_history"],
  ["Generate the commitment letter for this loan", "generate_letter"],
];

/** Stands in for TypeSafe: a fixed intent per message, and a record of every question. */
class StubDecider implements Decider {
  readonly questions: string[] = [];
  constructor(
    private readonly intents: Record<string, Intent>,
    private readonly confidence = 0.95
  ) {}

  async choose<K extends string>(state: unknown, instructions: string, criteria: Record<K, string>): Promise<ChoiceDecision<K>> {
    this.questions.push(instructions);
    const keys = Object.keys(criteria) as K[];
    if (keys.length === Object.keys(INTENTS).length) {
      const intent = this.intents[(state as { message: string }).message] ?? "out_of_scope";
      return { choice: intent as K, confidence: this.confidence, probabilities: { [intent]: this.confidence, list_loans: 0.03 } as Partial<Record<K, number>> };
    }
    return { choice: keys[0], confidence: this.confidence, probabilities: {} };
  }
}

function setup(options: { confidence?: number; signer?: string } = {}) {
  const tools = new FixtureToolGateway();
  const decider = new StubDecider(
    {
      ...Object.fromEntries(CLICKPATH),
      "apply the rate at 6.75% to the record": "apply_terms",
      "Send it for signature": "send_for_signature",
      "Send it for signature to jordan.pike@example.com": "send_for_signature",
    },
    options.confidence
  );
  const agent = new LoanAgent(tools, decider, {
    high: 0.85,
    medium: 0.5,
    defaultSigner: options.signer ? { email: options.signer } : undefined,
    now: () => new Date("2026-09-23T12:00:00Z"),
  });
  return { tools, decider, agent };
}

async function send(agent: LoanAgent, message: string, session = "s1") {
  const events: AgentEvent[] = [];
  await agent.handle(session, message, undefined, event => events.push(event));
  const text = events.map(event => (event.kind === "delta" ? event.text : "")).join("");
  const citations = events.flatMap(event => (event.kind === "citation" ? [event.citation.label] : []));
  const proposals = events.flatMap(event => (event.kind === "proposal" ? [event.proposal] : []));
  const blocks = events.flatMap(event => (event.kind === "block" ? [event.block] : []));
  const trace = events.flatMap(event => (event.kind === "trace" && event.step.status !== "running" ? [`${event.step.title}:${event.step.status}`] : []));
  return { events, text, citations, proposals, blocks, trace };
}

describe("clickpath on fixtures", () => {
  it("finds the latest active loan and its critical-risk documents", async () => {
    const { agent } = setup();
    const turn = await send(agent, CLICKPATH[0][0]);
    expect(turn.text).toBe(
      "In Harborview Logistics Commercial Real Estate 2026 (LN-2026-0003, Approved), 1 document is flagged Critical policy risk."
    );
    expect(turn.blocks).toEqual([
      {
        type: "documents",
        items: [
          expect.objectContaining({ name: "harborview-term-sheet-2026-borrower-markup.pdf", detail: "Term Sheet · Critical risk" }),
        ],
      },
    ]);
    expect(turn.citations).toEqual(["harborview-term-sheet-2026-borrower-markup.pdf"]);
    expect(turn.trace).toContain("Rule · latest loan:succeeded");
    expect(turn.events.find(event => event.kind === "context")).toMatchObject({
      kind: "context",
      loan: { loanId: "LN-2026-0003", name: "Harborview Logistics Commercial Real Estate 2026", borrower: "Harborview Logistics", status: "Approved" },
    });
  });

  it("extracts the term sheet and applies policy rules to the borrower's markup", async () => {
    const { agent } = setup();
    await send(agent, CLICKPATH[0][0]);
    const turn = await send(agent, CLICKPATH[1][0]);
    expect(turn.text).toMatch(/^Extracted \d+ terms from harborview-term-sheet-2026-borrower-markup\.pdf\. Of 4 policy checks, /);
    expect(turn.text).not.toMatch(/[•✓✗]/);
    const [facts, checks] = turn.blocks;
    expect(facts).toMatchObject({ type: "facts", title: "Terms" });
    expect(facts.type === "facts" && facts.rows).toContainEqual({ label: "Amount", value: "$4.8M" });
    expect(checks).toMatchObject({ type: "checks", title: "Credit policy" });
    const rows = checks.type === "checks" ? checks.rows : [];
    expect(rows).toContainEqual(
      expect.objectContaining({ label: "Loan-to-value", status: "pass", detail: "75% within the 75% limit" })
    );
    expect(rows).toContainEqual(
      expect.objectContaining({ label: "Debt service coverage", status: "fail", value: "Outside policy", detail: expect.stringMatching(/^1\.1x tested annually/) })
    );
    expect(rows).toContainEqual(expect.objectContaining({ label: "Pricing", status: "pass" }));
    expect(turn.citations).toContain("LOS-DSCR-001 · Standard DSCR");
  });

  it("validates against the record, reusing the extraction", async () => {
    const { agent } = setup();
    await send(agent, CLICKPATH[0][0]);
    await send(agent, CLICKPATH[1][0]);
    const turn = await send(agent, CLICKPATH[2][0]);
    expect(turn.text).toMatch(/fields match, 1 mismatch\. Nothing has been written\.$/);
    expect(turn.blocks[0]).toMatchObject({ type: "table", columns: ["Field", "Document", "Record"] });
    expect(turn.blocks[0].type === "table" && turn.blocks[0].rows).toContainEqual({
      cells: ["Rate", "6.85", "6.5"],
      status: "fail",
      note: "Mismatch",
    });
    expect(turn.trace.some(step => step.startsWith("LOS · extractLoanTerms"))).toBe(false);
  });

  it("holds the write as a proposal and runs it only once, on approval", async () => {
    const { agent, tools } = setup();
    for (const [message] of CLICKPATH.slice(0, 3)) await send(agent, message);
    const turn = await send(agent, CLICKPATH[3][0]);
    expect(tools.writes).toEqual([]);
    const proposal = turn.proposals[0];
    expect(proposal.params?.map(param => param.label)).toEqual(["Amount", "Rate", "Term"]);

    const resolved = await agent.resolve("s1", proposal.id, "approved");
    expect(resolved.decision).toBe("approved");
    expect(tools.writes).toEqual([
      { tool: "applyLoanTerms", input: { loanId: "LN-2026-0003", terms: { loanAmount: 4800000, interestRate: 6.85, termMonths: 120 } } },
    ]);
    await expect(agent.resolve("s1", proposal.id, "approved")).rejects.toThrow(/no longer pending/);
  });

  it("uses values the officer states over extracted ones", async () => {
    const { agent } = setup();
    await send(agent, CLICKPATH[0][0]);
    const turn = await send(agent, "apply the rate at 6.75% to the record");
    expect(turn.proposals[0].params).toEqual([{ label: "Rate", value: "6.75%" }]);
  });

  it("does not run a proposal from another session", async () => {
    const { agent, tools } = setup();
    await send(agent, CLICKPATH[0][0]);
    const turn = await send(agent, CLICKPATH[3][0]);
    await expect(agent.resolve("someone-else", turn.proposals[0].id, "approved")).rejects.toThrow();
    expect(tools.writes).toEqual([]);
  });

  it("compares covenants with prior executed loans and flags departures", async () => {
    const { agent } = setup();
    await send(agent, CLICKPATH[0][0]);
    const turn = await send(agent, CLICKPATH[4][0]);
    expect(turn.text).toMatch(/depart from precedent\.$/);
    const [table] = turn.blocks;
    expect(table).toMatchObject({ type: "table", columns: ["Covenant", "LN-2023-0311", "LN-2025-0148", "This markup"] });
    const rows = table.type === "table" ? table.rows : [];
    expect(rows).toContainEqual({ cells: ["LTV max", "70%", "70%", "75%"], status: "warn", note: "Departs from precedent" });
    expect(rows).toContainEqual({ cells: ["Testing", "quarterly", "quarterly", "annual"], status: "warn", note: "Departs from precedent" });
    expect(turn.citations).toContain("harborview-loan-agreement-2023-executed.pdf");
  });

  it("generates the letter with all 15 Doc Gen paths, then gates signature on a signer", async () => {
    const { agent, tools } = setup();
    await send(agent, CLICKPATH[0][0]);
    const generate = await send(agent, CLICKPATH[5][0]);
    await agent.resolve("s1", generate.proposals[0].id, "approved");
    const docgen = tools.writes.find(write => write.tool === "create_docgen_batch")!.input as { userInput: Record<string, Record<string, string>> };
    const leaves = Object.values(docgen.userInput).flatMap(group => Object.values(group));
    expect(leaves).toHaveLength(15);
    expect(leaves.every(value => typeof value === "string" && value.length > 0)).toBe(true);

    const noSigner = await send(agent, "Send it for signature");
    expect(noSigner.text).toContain("Who should sign?");
    const withSigner = await send(agent, "Send it for signature to jordan.pike@example.com");
    const resolved = await agent.resolve("s1", withSigner.proposals[0].id, "approved");
    expect(resolved.note).toContain("jordan.pike@example.com");
  });

  it("reports an approved action that then fails as failed, and records no letter", async () => {
    const { agent, tools } = setup({ signer: "dana@example.com" });
    tools.generateCommitmentLetter = () => Promise.reject(new Error("Box create_docgen_batch: Item not found"));
    await send(agent, CLICKPATH[0][0]);
    const generate = await send(agent, CLICKPATH[5][0]);
    const resolved = await agent.resolve("s1", generate.proposals[0].id, "approved");
    expect(resolved).toMatchObject({ decision: "approved", outcome: "failed" });
    expect(resolved.note).toBe("Box create_docgen_batch: Item not found");
    const sign = await send(agent, "Send it for signature");
    expect(sign.proposals).toEqual([]);
  });

  it("checks Doc Gen before asking for approval, and explains instead of proposing when it can't run", async () => {
    const { agent, tools } = setup();
    tools.checkDocGen = async folderId => ({
      ready: false,
      items: [
        { what: "template", ok: false, detail: "Template 2482573818840 isn't a Doc Gen template the signed-in Box user can open (Box: Item not found).", fix: "Check LOS_DOCGEN_TEMPLATE_FILE_ID." },
        { what: "folder", ok: true, detail: `folder ${folderId}` },
      ],
    });
    await send(agent, CLICKPATH[0][0]);
    const turn = await send(agent, CLICKPATH[5][0]);
    expect(turn.proposals).toEqual([]);
    expect(turn.text).toMatch(/^I can't generate the commitment letter for LN-2026-0003 yet/);
    expect(turn.trace).toContain("Box · check Doc Gen access:failed");
    const [checks] = turn.blocks;
    expect(checks).toMatchObject({ type: "checks", title: "Box Doc Gen" });
    expect(checks.type === "checks" && checks.rows.map(row => [row.label, row.status])).toEqual([
      ["Template", "fail"],
      ["Loan folder", "pass"],
    ]);
    expect(turn.events.find(event => event.kind === "options")).toMatchObject({ options: [{ label: "Check again" }] });
    expect(turn.events.find(event => event.kind === "done")).toMatchObject({ status: "needs_input" });
    const plan = turn.events.filter(event => event.kind === "todos").at(-1);
    expect(plan?.kind === "todos" && plan.todos.map(todo => todo.status)).toEqual(["completed", "completed", "completed", "skipped"]);
    expect(tools.writes).toEqual([]);
  });

  it("marks an approved action that ran as done", async () => {
    const { agent } = setup();
    await send(agent, CLICKPATH[0][0]);
    const apply = await send(agent, CLICKPATH[3][0]);
    expect(await agent.resolve("s1", apply.proposals[0].id, "approved")).toMatchObject({ outcome: "done" });
  });

  describe("signature", () => {
    async function withLetter(options: { signer?: string } = { signer: "dana@example.com" }) {
      const env = setup(options);
      await send(env.agent, CLICKPATH[0][0]);
      const generate = await send(env.agent, CLICKPATH[5][0]);
      const generated = await env.agent.resolve("s1", generate.proposals[0].id, "approved");
      return { ...env, generated };
    }

    it("links the generated letter", async () => {
      const { generated } = await withLetter();
      expect(generated.details).toEqual([{ label: "File", value: "LN-2026-0003-Commitment-Letter.pdf", href: "https://app.box.com/file/900099" }]);
    });

    it("reports a prepared request with its ID, and refuses a second one for the same letter", async () => {
      const { agent } = await withLetter();
      const sign = await send(agent, "Send it for signature");
      expect(sign.trace).toContain("LOS · getLoanPackage:succeeded");
      const resolved = await agent.resolve("s1", sign.proposals[0].id, "approved");
      expect(resolved).toMatchObject({ outcome: "done", details: [{ label: "Request", value: "fixture-sign-request" }] });
      const again = await send(agent, "Send it for signature");
      expect(again.proposals).toEqual([]);
      expect(again.text).toMatch(/already exists for LN-2026-0003-Commitment-Letter\.pdf, so I won't create another/);
    });

    it("treats a refusal from Salesforce as a failure, never as done", async () => {
      const { agent, tools } = await withLetter();
      tools.prepareSignatureRequest = async () => ({
        prepared: false,
        summary: "Box Sign refused the request (400). Nothing was prepared and nothing was sent.",
      });
      const sign = await send(agent, "Send it for signature");
      const resolved = await agent.resolve("s1", sign.proposals[0].id, "approved");
      expect(resolved).toMatchObject({ outcome: "failed", note: "Box Sign refused the request (400). Nothing was prepared and nothing was sent." });
    });

    it("blocks a duplicate after a request was created but not prepared", async () => {
      const { agent, tools } = await withLetter();
      tools.prepareSignatureRequest = async () => ({ prepared: false, summary: "Box Sign created request 77, but has not returned an iframe signing URL.", requestId: "77" });
      const sign = await send(agent, "Send it for signature");
      expect(await agent.resolve("s1", sign.proposals[0].id, "approved")).toMatchObject({ outcome: "failed" });
      const again = await send(agent, "Send it for signature");
      expect(again.text).toMatch(/A Box Sign request \(77\) already exists/);
    });

    it("checks the loan's current status before asking, and says why it can't be signed", async () => {
      const { agent, tools } = await withLetter();
      const read = tools.getLoanPackage.bind(tools);
      tools.getLoanPackage = async loan => ({ ...(await read(loan)), status: "Underwriting", risk: "High" });
      const sign = await send(agent, "Send it for signature");
      expect(sign.proposals).toEqual([]);
      expect(sign.text).toBe(
        "LN-2026-0003 is Underwriting, so it can't go for signature yet. Salesforce allows signature once the loan is Approved or Commitment, after Credit Committee approval is recorded. Nothing was sent."
      );
      expect(sign.trace).toContain("Rule · signature status:failed");
      expect(tools.writes.filter(write => write.tool === "prepareSignatureRequest")).toEqual([]);
    });
  });

  it("will not send a letter this conversation did not generate", async () => {
    const { agent } = setup({ signer: "dana@example.com" });
    await send(agent, CLICKPATH[0][0]);
    const turn = await send(agent, "Send it for signature");
    expect(turn.text).toContain("Generate the commitment letter first");
    expect(turn.proposals).toEqual([]);
  });
});

describe("structured results", () => {
  it("lists loans as a table, newest first", async () => {
    const { tools } = setup();
    const agent = new LoanAgent(tools, new StubDecider({ "Harborview Logistics closed loans": "list_loans" }), { high: 0.85, medium: 0.5 });
    const turn = await send(agent, "Harborview Logistics closed loans");
    expect(turn.text).toMatch(/^\d+ loans? for Harborview Logistics, Closed, newest first\.$/);
    expect(turn.blocks[0]).toMatchObject({ type: "table", columns: ["Loan", "Name", "Status", "Amount"] });
    const ids = turn.blocks[0].type === "table" ? turn.blocks[0].rows.map(row => row.cells[0]) : [];
    expect(ids).toEqual([...ids].sort().reverse());
  });

  it("never formats results as text bullets or glyphs", async () => {
    const { agent } = setup();
    for (const message of [...CLICKPATH.map(([m]) => m), "what can you do?"]) {
      expect((await send(agent, message)).text, message).not.toMatch(/[•✓✗←]/);
    }
  });

  it("sums up policy findings in one sentence", () => {
    const finding = (verdict: PolicyFinding["verdict"]): PolicyFinding => ({ topic: "Pricing", verdict, detail: "", policyIds: [] });
    expect(policySummary([finding("within"), finding("within"), finding("exception"), finding("outside")])).toBe(
      "Of 4 policy checks, 2 within policy, 1 needs an exception and 1 is outside policy."
    );
    expect(policySummary([finding("outside"), finding("outside")])).toBe("Of 2 policy checks, 2 are outside policy.");
    expect(policySummary([])).toBe("No policy checks applied.");
  });
});

describe("turn protocol", () => {
  it("numbers events 1..n with no gaps and ends every turn with done", async () => {
    const { agent } = setup();
    for (const [message] of CLICKPATH) {
      const turn = await send(agent, message);
      expect(turn.events.map(event => event.seq)).toEqual(turn.events.map((_, i) => i + 1));
      expect(turn.events.filter(event => event.kind === "done")).toHaveLength(1);
      expect(turn.events[turn.events.length - 1].kind).toBe("done");
    }
  });

  it("streams the plan as it progresses and completes it", async () => {
    const { agent } = setup();
    await send(agent, CLICKPATH[0][0]);
    const turn = await send(agent, CLICKPATH[1][0]);
    const snapshots = turn.events.flatMap(event => (event.kind === "todos" ? [event.todos.map(todo => todo.status)] : []));
    expect(snapshots[0]).toEqual(["in_progress", "pending", "pending", "pending"]);
    expect(snapshots[1]).toEqual(["completed", "in_progress", "pending", "pending"]);
    expect(snapshots[snapshots.length - 1]).toEqual(["completed", "completed", "completed", "completed"]);
    expect(turn.events.find(event => event.kind === "options")).toMatchObject({
      options: [{ label: "Validate record" }, { label: "Compare history" }],
    });
    expect(turn.events.find(event => event.kind === "done")).toMatchObject({ status: "complete" });
  });

  it("marks a turn waiting on approval as needs_input", async () => {
    const { agent } = setup();
    await send(agent, CLICKPATH[0][0]);
    const turn = await send(agent, CLICKPATH[3][0]);
    expect(turn.events.find(event => event.kind === "done")).toMatchObject({ status: "needs_input" });
  });

  it("skips the rest of the plan when a step stops the turn", async () => {
    const { agent } = setup();
    const turn = await send(agent, CLICKPATH[1][0]); // no loan in context
    const last = turn.events.filter(event => event.kind === "todos").pop();
    expect(last).toMatchObject({ todos: [{ status: "skipped" }, { status: "skipped" }, { status: "skipped" }, { status: "skipped" }] });
    expect(turn.events.find(event => event.kind === "done")).toMatchObject({ status: "needs_input" });
  });

  it("offers the two likeliest intents when it asks for clarification", async () => {
    const { agent } = setup({ confidence: 0.4 });
    const turn = await send(agent, CLICKPATH[1][0]);
    expect(turn.events.find(event => event.kind === "options")).toMatchObject({
      options: [{ label: "Extract & check policy" }, { label: "Borrower's closed loans" }],
    });
  });
});

describe("decision gating", () => {
  it("asks instead of acting when TypeSafe is not confident", async () => {
    const { agent, tools } = setup({ confidence: 0.4 });
    const turn = await send(agent, CLICKPATH[1][0]);
    expect(turn.text).toMatch(/not confident what you'd like \(40%\)/);
    expect(turn.trace.filter(step => step.startsWith("LOS"))).toEqual([]);
    expect(tools.writes).toEqual([]);
  });

  it("takes no action when TypeSafe fails", async () => {
    const tools = new FixtureToolGateway();
    const failing: Decider = { choose: () => Promise.reject(new TypeSafeError("TypeSafe returned 503")) };
    const agent = new LoanAgent(tools, failing, { high: 0.85, medium: 0.5 });
    const turn = await send(agent, CLICKPATH[0][0]);
    expect(turn.text).toContain("couldn't get a decision from TypeSafe");
    expect(turn.trace).toEqual(["TypeSafe · route intent:failed"]);
    expect(turn.events.find(event => event.kind === "done")).toMatchObject({ status: "error" });
  });

  it("asks which loan rather than guessing", async () => {
    const { agent } = setup();
    const turn = await send(agent, CLICKPATH[1][0]);
    expect(turn.text).toContain("Which loan?");
  });
});

describe("tools that need a person first", () => {
  it("passes the sign-in instruction through and waits for the officer", async () => {
    const tools = new FixtureToolGateway();
    tools.listLoans = async () => {
      throw new ActionRequiredError("Salesforce isn't connected. Sign in at http://localhost:8787/oauth/salesforce/login.");
    };
    const agent = new LoanAgent(tools, new StubDecider({ "list loans": "list_loans" }), { high: 0.85, medium: 0.5 });
    const turn = await send(agent, "list loans");
    expect(turn.text).toBe("Salesforce isn't connected. Sign in at http://localhost:8787/oauth/salesforce/login.");
    expect(turn.events.find(event => event.kind === "done")).toMatchObject({ status: "needs_input" });
  });
});

describe("document types for risk search hits", () => {
  // Live Box search returns only id, type and name, so the type is looked up per file.
  function withoutTypes() {
    const { tools, agent } = setup();
    const search = tools.findByPolicyRisk.bind(tools);
    tools.findByPolicyRisk = async (folderId, risk) =>
      (await search(folderId, risk)).map(({ documentType: _type, ...hit }) => hit);
    return { tools, agent };
  }

  it("looks up each untyped hit and labels it", async () => {
    const { tools, agent } = withoutTypes();
    const looked: string[] = [];
    const lookup = tools.getDocumentType.bind(tools);
    tools.getDocumentType = async fileId => {
      looked.push(fileId);
      return lookup(fileId);
    };
    const turn = await send(agent, CLICKPATH[0][0]);
    expect(looked).toHaveLength(1);
    expect(turn.blocks[0]).toMatchObject({ items: [{ detail: "Term Sheet · Critical risk" }] });
    expect(turn.trace).toContain("Box · get_file_details:succeeded");
  });

  it("still answers, without the label, when the lookup fails", async () => {
    const { tools, agent } = withoutTypes();
    tools.getDocumentType = () => Promise.reject(new Error("Box 403"));
    const turn = await send(agent, CLICKPATH[0][0]);
    expect(turn.blocks[0]).toMatchObject({ items: [{ name: "harborview-term-sheet-2026-borrower-markup.pdf", detail: "Critical risk" }] });
    expect(turn.trace).toContain("Box · get_file_details:warning");
    expect(turn.events.find(event => event.kind === "done")).toMatchObject({ status: "complete" });
  });

  it("skips the lookup when the search already has the type", async () => {
    const { agent } = setup();
    const turn = await send(agent, CLICKPATH[0][0]);
    expect(turn.trace.some(step => step.startsWith("Box · get_file_details"))).toBe(false);
  });
});

describe("determinism", () => {
  it("replays the clickpath to byte-identical output", async () => {
    const run = async () => {
      const { agent } = setup();
      const out: AgentEvent[] = [];
      for (const [message] of CLICKPATH) {
        await agent.handle("s", message, undefined, event => out.push(event));
      }
      // Timestamps are wall-clock; everything else must match.
      return JSON.stringify(out, (key, value) => (key === "startedAt" || key === "finishedAt" ? undefined : value));
    };
    expect(await run()).toBe(await run());
  });
});

export type { Proposal };
