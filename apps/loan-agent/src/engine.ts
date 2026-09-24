import type {
  AgentEventBody,
  CheckStatus,
  Citation,
  Emit,
  PromptOption,
  Proposal,
  ResultBlock,
  StepStatus,
  Todo,
  TurnStatus,
} from "./contract.js";
import {
  TERM_FIELDS,
  newestFirst,
  type Extraction,
  type FieldCheck,
  type LoanDocument,
  type LoanPackage,
  type LoanRow,
  type TermField,
  type Terms,
} from "./los.js";
import { POLICIES, evaluateTerms, money, type PolicyFinding } from "./policy.js";
import { ActionRequiredError, SIGNABLE_STATUSES, type CovenantFields, type MetadataHit, type ToolGateway } from "./tools.js";
import { TypeSafeError, runnerUp, type Decider } from "./typesafe.js";
import {
  INTENTS,
  documentKind,
  emailAddress,
  filePattern,
  loanReference,
  loanStatus,
  namedBorrowers,
  namedFields,
  riskLevel,
  valueOverrides,
  type Intent,
} from "./understand.js";

/**
 * An agent loop with no LLM:
 *
 *   message ─▶ TypeSafe picks one intent from INTENTS (closed set)
 *           ─▶ rules pull arguments from the message and session
 *           ─▶ a fixed tool program for that intent runs (reads only)
 *           ─▶ credit policy is evaluated in code
 *           ─▶ the reply is rendered from templates
 *
 * Writes never run in a turn: they become proposals, and run only from
 * resolve() after a person approves. Given the same TypeSafe decision and the
 * same tool results, a turn always produces the same reply.
 */

export interface AgentOptions {
  /** TypeSafe confidence at or above which the agent acts without a flag. */
  high: number;
  /** Below this the agent asks instead of acting. */
  medium: number;
  defaultSigner?: { name?: string; email: string };
  now?: () => Date;
  /** Keeps conversations and pending approvals across restarts. Without one they live in memory only. */
  store?: SessionStore;
}

/** Where the agent keeps its conversations between restarts. */
export interface SessionStore {
  load(): AgentSnapshot | undefined;
  save(snapshot: AgentSnapshot): void;
}

/** Everything a restarted agent needs to carry on: what each conversation knows, and what waits for approval. */
export interface AgentSnapshot {
  version: 1;
  proposalCounter: number;
  sessions: Array<{ id: string; usedAt: string; state: SavedSession }>;
  pending: PendingAction[];
}

/** A session without its in-flight Box AI caches, which are only worth keeping while the process runs. */
type SavedSession = Omit<Session, "covenants" | "packages">;

/** Enough recent conversations to survive a restart mid-demo, without growing forever. */
export const MAX_SAVED_SESSIONS = 50;

interface Session {
  loan?: LoanPackage;
  borrowers?: string[];
  extraction?: { loanId: string; file: LoanDocument; result: Extraction; covenants?: CovenantFields };
  findings?: PolicyFinding[];
  precedent?: Array<{ loanId: string; file: LoanDocument; covenants: CovenantFields }>;
  letter?: { loanId: string; fileId: string; fileName: string };
  /** The Box Sign request made for the letter, so a second one is never created for it. */
  signature?: { fileId: string; requestId: string };
  /**
   * Box AI covenant extractions by file, and prior loans' packages by loan ID,
   * for this conversation: comparing again, or after a new extraction, reuses
   * them instead of paying for the same Box AI call twice.
   */
  covenants?: Map<string, Promise<CovenantFields>>;
  packages?: Map<string, Promise<LoanPackage>>;
}

/** What an approved action reports: a note, and anything it produced worth linking. */
type ActionResult = string | { note: string; details?: NonNullable<Proposal["details"]> };

/**
 * An approved write, as data rather than a closure, so an approval can be
 * saved and still run after a restart. Everything it needs was fixed when it
 * was proposed: approving runs exactly what the card showed.
 */
type Action =
  | { kind: "applyTerms"; loanId: string; terms: Terms }
  | { kind: "generateLetter"; loanId: string; folderId: string; fileName: string; userInput: Record<string, unknown> }
  | { kind: "sendForSignature"; loanId: string; fileId: string; email: string; name?: string };

interface PendingAction {
  sessionId: string;
  proposal: Proposal;
  action: Action;
}

const INTENT_LABELS: Record<Intent, string> = {
  find_risk_documents: "find policy-risk documents",
  extract_and_check: "extract terms and check policy",
  validate_record: "compare terms with the loan record",
  apply_terms: "apply terms to the record",
  compare_history: "compare with prior loans",
  generate_letter: "generate the commitment letter",
  send_for_signature: "send the letter for signature",
  list_loans: "list loans",
  out_of_scope: "something else",
};

const FIELD_LABELS: Record<TermField, string> = {
  loanAmount: "Amount",
  interestRate: "Rate",
  termMonths: "Term",
  collateralValue: "Collateral value",
  ltv: "LTV",
  dscr: "DSCR",
  maturityDate: "Maturity",
};

/** The plan shown while each intent runs (Box AI's TodoList). */
const PLANS: Record<Intent, string[]> = {
  find_risk_documents: ["Resolve the loan", "Search losDocument metadata", "List the flagged documents"],
  extract_and_check: ["Resolve the loan", "Extract terms with Box AI", "Check credit policy", "Summarize findings"],
  validate_record: ["Resolve the loan", "Get the extracted terms", "Compare with the loan record"],
  apply_terms: ["Resolve the loan", "Collect the terms to apply", "Hold the write for your approval"],
  compare_history: ["Resolve the loan", "Find prior executed loans", "Extract covenants from each agreement", "Compare with this markup"],
  generate_letter: ["Resolve the loan", "Build the 15 Doc Gen fields", "Check Box Doc Gen access", "Hold generation for your approval"],
  send_for_signature: ["Find the letter generated in this session", "Confirm the signer", "Check the loan can be signed", "Hold the Box Sign request for your approval"],
  list_loans: ["Query LOS loans"],
  out_of_scope: [],
};

/** One canonical prompt per intent, matching the chat app's prompt library. */
const INTENT_PROMPTS: Record<Intent, PromptOption> = {
  find_risk_documents: { label: "Find critical risk", prompt: "Which documents in this loan are flagged critical policy risk?" },
  extract_and_check: { label: "Extract & check policy", prompt: "Extract loan terms from the marked-up term sheet for that loan and check them against credit policy." },
  validate_record: { label: "Validate record", prompt: "Validate those terms against the Salesforce record." },
  apply_terms: { label: "Apply terms", prompt: "apply the amount, rate and term to the record, confirm" },
  compare_history: { label: "Compare history", prompt: "Compare the covenant terms across Harborview's prior executed loans and this 2026 markup." },
  generate_letter: { label: "Commitment letter", prompt: "Generate the commitment letter for this loan." },
  send_for_signature: { label: "Send for signature", prompt: "Send the commitment letter for signature." },
  list_loans: { label: "Borrower's closed loans", prompt: "What closed loans does Harborview Logistics have with us?" },
  out_of_scope: { label: "What can you do?", prompt: "What can you help with?" },
};

/** Next steps offered after each intent completes. */
const NEXT: Record<Intent, Intent[]> = {
  find_risk_documents: ["extract_and_check", "compare_history"],
  extract_and_check: ["validate_record", "compare_history"],
  validate_record: ["apply_terms"],
  apply_terms: ["generate_letter"],
  compare_history: ["generate_letter"],
  generate_letter: ["send_for_signature"],
  send_for_signature: [],
  list_loans: ["compare_history"],
  out_of_scope: ["find_risk_documents", "list_loans"],
};

const ACTIVE_STATUSES = new Set(["Underwriting", "Credit Review", "Approved", "Commitment"]);

class UserFacingError extends Error {}

/** One turn's output channel: trace steps, streamed text, citations, proposals. */
class Turn {
  private stepCount = 0;
  private seq = 0;
  private readonly cited = new Set<string>();
  private todos: Todo[] = [];
  private current = 0;
  proposed = false;
  /** Set when the turn stops short on purpose: the rest of the plan is skipped and these are offered next. */
  stoppedWith?: PromptOption[];

  constructor(private readonly sink: Emit) {}

  private emit(event: AgentEventBody) {
    this.sink({ ...event, seq: ++this.seq });
  }

  /** Announce the turn's plan; the first item starts in progress. */
  plan(items: string[]) {
    this.todos = items.map((content, i) => ({ id: `todo-${i}`, content, status: i === 0 ? "in_progress" : "pending" }));
    this.current = 0;
    if (this.todos.length) this.emit({ kind: "todos", todos: this.todos });
  }

  /** Finish the current plan item and start the next. */
  advance() {
    if (this.current >= this.todos.length - 1) return;
    this.current += 1;
    this.publishTodos(i => (i < this.current ? "completed" : i === this.current ? "in_progress" : "pending"));
  }

  finishPlan(succeeded: boolean) {
    this.publishTodos(i => (succeeded || i < this.current ? "completed" : "skipped"));
  }

  private publishTodos(status: (index: number) => Todo["status"]) {
    if (!this.todos.length) return;
    this.todos = this.todos.map((todo, i) => ({ ...todo, status: status(i) }));
    this.emit({ kind: "todos", todos: this.todos });
  }

  options(options: PromptOption[]) {
    if (options.length) this.emit({ kind: "options", options });
  }

  done(status: TurnStatus) {
    this.emit({ kind: "done", status });
  }

  async step<T>(title: string, description: string, work: () => Promise<T>, status?: (value: T) => StepStatus): Promise<T> {
    const id = `step-${++this.stepCount}`;
    const startedAt = new Date().toISOString();
    this.emit({ kind: "trace", step: { id, title, description, status: "running", startedAt } });
    try {
      const value = await work();
      this.emit({
        kind: "trace",
        step: { id, title, description, status: status?.(value) ?? "succeeded", startedAt, finishedAt: new Date().toISOString() },
      });
      return value;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.emit({
        kind: "trace",
        step: { id, title, description: `${description} · ${message}`, status: "failed", startedAt, finishedAt: new Date().toISOString() },
      });
      throw error;
    }
  }

  note(title: string, description: string, status: StepStatus) {
    this.emit({ kind: "trace", step: { id: `step-${++this.stepCount}`, title, description, status } });
  }

  say(lines: string[]) {
    const text = lines.join("\n");
    for (const line of text.split(/(?<=\n)/)) {
      this.emit({ kind: "delta", text: line });
    }
  }

  /** A structured result, after the sentence that introduces it. */
  block(block: ResultBlock) {
    this.emit({ kind: "block", block });
  }

  cite(citation: Citation) {
    if (!this.cited.has(citation.id)) {
      this.cited.add(citation.id);
      this.emit({ kind: "citation", citation });
    }
  }

  propose(proposal: Proposal) {
    this.proposed = true;
    this.emit({ kind: "proposal", proposal });
  }

  context(loan: LoanPackage) {
    if (loan.loanId) {
      this.emit({
        kind: "context",
        loan: { loanId: loan.loanId, name: loan.name, borrower: loan.borrower, status: loan.status, ...(loan.risk ? { risk: loan.risk } : {}) },
      });
    }
  }
}

export class LoanAgent {
  private readonly sessions = new Map<string, Session>();
  /** When each session last had a turn or a decision, least recent first: the oldest are dropped first when saving. */
  private readonly usedAt = new Map<string, string>();
  private readonly pending = new Map<string, PendingAction>();
  private proposalCounter = 0;

  constructor(
    private readonly tools: ToolGateway,
    private readonly decider: Decider,
    private readonly options: AgentOptions
  ) {
    const saved = options.store?.load();
    if (saved) {
      // Saved most recent first; kept here least recent first.
      for (const { id, usedAt, state } of [...saved.sessions].reverse()) {
        this.sessions.set(id, state);
        this.usedAt.set(id, usedAt);
      }
      for (const action of saved.pending) {
        if (this.sessions.has(action.sessionId)) this.pending.set(action.proposal.id, action);
      }
      this.proposalCounter = saved.proposalCounter;
    }
  }

  /** How many conversations and approvals were carried over from the last run. */
  get restored(): { sessions: number; pending: number } {
    return { sessions: this.sessions.size, pending: this.pending.size };
  }

  async handle(sessionId: string, message: string, loanHint: string | undefined, emit: Emit): Promise<void> {
    const turn = new Turn(emit);
    const session = this.session(sessionId);
    let status: TurnStatus = "complete";
    try {
      const intent = await this.route(turn, session, message);
      if (!intent) {
        status = "needs_input";
        return;
      }
      turn.plan(PLANS[intent]);
      await this.dispatch(intent, turn, session, sessionId, message, loanHint);
      turn.finishPlan(!turn.stoppedWith);
      turn.options(turn.stoppedWith ?? NEXT[intent].map(next => INTENT_PROMPTS[next]));
      if (turn.proposed || turn.stoppedWith) status = "needs_input";
    } catch (error) {
      turn.finishPlan(false);
      if (error instanceof UserFacingError || error instanceof ActionRequiredError) {
        status = "needs_input";
        turn.say([error.message]);
      } else if (error instanceof TypeSafeError) {
        status = "error";
        turn.say([`I couldn't get a decision from TypeSafe, so I took no action. (${error.message})`]);
      } else {
        status = "error";
        turn.say([`That step failed, so I stopped. (${error instanceof Error ? error.message : String(error)})`]);
      }
    } finally {
      this.save(sessionId);
      turn.done(status);
    }
  }

  async resolve(sessionId: string, proposalId: string, decision: "approved" | "rejected", note?: string): Promise<Proposal> {
    const action = this.pending.get(proposalId);
    if (!action || action.sessionId !== sessionId) {
      // Also what a page sees for a conversation the agent dropped, or never saved.
      throw new UserFacingError(
        "This approval is no longer pending: it was already decided, or the loan agent no longer has this conversation. Nothing was changed. Ask again to get a new one."
      );
    }
    this.pending.delete(proposalId);
    // Saved before anything runs: a crash mid-write must never leave the approval open to run twice.
    this.save(sessionId);
    if (decision === "rejected") {
      return { ...action.proposal, decision, note: note ?? "Not applied. Nothing was changed." };
    }
    try {
      const result = await this.run(sessionId, action.action);
      return typeof result === "string"
        ? { ...action.proposal, decision, outcome: "done", note: result }
        : { ...action.proposal, decision, outcome: "done", note: result.note, ...(result.details?.length ? { details: result.details } : {}) };
    } catch (error) {
      // Approved is the officer's decision; failed is what happened next. Keep both.
      return {
        ...action.proposal,
        decision,
        outcome: "failed",
        // The reason only: the client says "didn't complete" beside it.
        note: error instanceof Error ? error.message : String(error),
      };
    }
  }

  // ── Routing ───────────────────────────────────────────────────────────

  private async route(turn: Turn, session: Session, message: string): Promise<Intent | undefined> {
    const state = {
      message,
      loanInContext: session.loan?.loanId ?? null,
      termsExtracted: Boolean(session.extraction),
      letterGenerated: Boolean(session.letter),
    };
    const decision = await turn.step(
      "TypeSafe · route intent",
      "Choose one operation from the fixed set",
      () => this.decider.choose(state, "Which operation does the loan officer's message ask for?", INTENTS),
      value => (value.confidence >= this.options.high ? "succeeded" : "warning")
    );
    const pct = Math.round(decision.confidence * 100);
    turn.note(`Intent → ${decision.choice}`, `Confidence ${pct}%`, decision.confidence >= this.options.high ? "succeeded" : "warning");

    if (decision.confidence < this.options.medium) {
      const second = runnerUp(decision);
      turn.say([
        `I'm not confident what you'd like (${pct}%). Did you mean to ${INTENT_LABELS[decision.choice]}` +
          (second ? ` or ${INTENT_LABELS[second]}?` : "?"),
        "Rephrase or pick a suggestion below.",
      ]);
      turn.options([decision.choice, second].filter((intent): intent is Intent => Boolean(intent) && intent !== "out_of_scope").map(intent => INTENT_PROMPTS[intent]));
      return undefined;
    }
    return decision.choice;
  }

  private dispatch(intent: Intent, turn: Turn, session: Session, sessionId: string, message: string, loanHint?: string) {
    switch (intent) {
      case "find_risk_documents":
        return this.findRiskDocuments(turn, session, message, loanHint);
      case "extract_and_check":
        return this.extractAndCheck(turn, session, message, loanHint);
      case "validate_record":
        return this.validateRecord(turn, session, message, loanHint);
      case "apply_terms":
        return this.applyTerms(turn, session, sessionId, message, loanHint);
      case "compare_history":
        return this.compareHistory(turn, session, message, loanHint);
      case "generate_letter":
        return this.generateLetter(turn, session, sessionId, message, loanHint);
      case "send_for_signature":
        return this.sendForSignature(turn, session, sessionId, message);
      case "list_loans":
        return this.listLoans(turn, session, message);
      case "out_of_scope":
        turn.say([
          "I work a loan with you: finding a borrower's latest loan and its critical-risk documents, extracting terms and checking them against credit policy and the record, and comparing covenants with prior loans.",
          "",
          "I can also apply terms, generate the commitment letter, and send it for signature. Each waits for your approval.",
        ]);
        return Promise.resolve();
    }
  }

  // ── Intents ───────────────────────────────────────────────────────────

  private async findRiskDocuments(turn: Turn, session: Session, message: string, loanHint?: string) {
    const loan = await this.resolveLoan(turn, session, message, loanHint, { preferLatest: true });
    const risk = riskLevel(message);
    const found = await turn.step("Box · search_files_metadata", `losDocument · policyRisk = '${risk}'`, () =>
      this.tools.findByPolicyRisk(requireFolder(loan), risk)
    );
    const hits = await this.withDocumentTypes(turn, found);
    turn.advance();
    if (hits.length === 0) {
      turn.say([`In ${loanPhrase(loan)}, no documents are flagged ${risk} policy risk.`]);
      return;
    }
    turn.say([`In ${loanPhrase(loan)}, ${count(hits.length, "document")} ${hits.length === 1 ? "is" : "are"} flagged ${risk} policy risk.`]);
    const citations = hits.map(hit => documentCitation(loan, hit.fileId, hit.name));
    turn.block({
      type: "documents",
      items: hits.map((hit, i) => ({
        id: hit.fileId,
        name: hit.name,
        detail: [hit.documentType, `${risk} risk`].filter(Boolean).join(" · "),
        href: citations[i].href,
      })),
    });
    for (const citation of citations) turn.cite(citation);
  }

  /**
   * Fills in documentType for hits the search returned without it, one Box
   * lookup per file. The label is cosmetic: a failed lookup leaves it off.
   */
  private async withDocumentTypes(turn: Turn, hits: MetadataHit[]): Promise<MetadataHit[]> {
    const missing = hits.filter(hit => !hit.documentType);
    if (missing.length === 0) return hits;
    const types = await turn.step(
      "Box · get_file_details",
      `losDocument documentType · ${missing.length} file${missing.length === 1 ? "" : "s"}`,
      () =>
        Promise.all(
          missing.map(hit =>
            this.tools.getDocumentType(hit.fileId).then(
              type => [hit.fileId, type] as const,
              () => [hit.fileId, undefined] as const
            )
          )
        ),
      results => (results.every(([, type]) => type) ? "succeeded" : "warning")
    );
    const byId = new Map(types);
    return hits.map(hit => (hit.documentType ? hit : { ...hit, documentType: byId.get(hit.fileId) }));
  }

  private async extractAndCheck(turn: Turn, session: Session, message: string, loanHint?: string) {
    const loan = await this.resolveLoan(turn, session, message, loanHint);
    const extraction = await this.extract(turn, session, loan, message);
    turn.advance();
    const findings = evaluateTerms(extraction.result.terms, extraction.covenants);
    session.findings = findings;
    turn.note("Credit policy rules", `${findings.length} checks against the approved library`, "succeeded");
    turn.advance();

    const terms = termPairs(extraction.result.terms);
    turn.say([`Extracted ${count(terms.length, "term")} from ${extraction.file.name}. ${policySummary(findings)}`]);
    turn.block({ type: "facts", title: "Terms", rows: terms });
    turn.block({
      type: "checks",
      title: "Credit policy",
      rows: findings.map(finding => ({
        label: finding.topic,
        value: VERDICT_LABEL[finding.verdict],
        detail: finding.approver ? `${finding.detail}. Approver: ${finding.approver}` : finding.detail,
        status: VERDICT_STATUS[finding.verdict],
      })),
    });
    turn.cite(documentCitation(loan, extraction.file.fileId, extraction.file.name));
    citePolicies(turn, findings);
  }

  private async validateRecord(turn: Turn, session: Session, message: string, loanHint?: string) {
    const loan = await this.resolveLoan(turn, session, message, loanHint);
    const extraction = await this.extract(turn, session, loan, message);
    turn.advance();
    const checks = extraction.result.checks;
    if (checks.length === 0) {
      turn.say(["The extraction returned no field comparison, so there is nothing to validate."]);
      return;
    }
    const mismatches = checks.filter(check => check.status === "mismatch").length;
    const matches = checks.filter(check => check.status === "match").length;
    turn.say([
      `${extraction.file.name} against the ${loan.loanId} record: ${matches} of ${checks.length} fields match` +
        (mismatches === 0 ? "." : `, ${count(mismatches, "mismatch", "mismatches")}. Nothing has been written.`),
    ]);
    turn.block({
      type: "table",
      columns: ["Field", "Document", "Record"],
      rows: checks.map(check => ({
        cells: [FIELD_LABELS[check.field], check.document ?? "—", check.record ?? "—"],
        status: CHECK_STATUS[check.status],
        note: CHECK_NOTE[check.status],
      })),
    });
    turn.cite(documentCitation(loan, extraction.file.fileId, extraction.file.name));
  }

  private async applyTerms(turn: Turn, session: Session, sessionId: string, message: string, loanHint?: string) {
    const loan = await this.resolveLoan(turn, session, message, loanHint);
    const extraction = await this.extract(turn, session, loan, message);
    const named = namedFields(message);
    const overrides = valueOverrides(message);
    // Canonical field order, not the tool's JSON key order, so the card never reshuffles.
    const terms: Terms = {};
    for (const field of TERM_FIELDS) {
      const value = overrides[field] ?? extraction.result.terms[field];
      const wanted = named.length === 0 || named.includes(field) || overrides[field] !== undefined;
      if (value !== undefined && wanted) {
        terms[field] = value;
      }
    }
    const fields = Object.keys(terms) as TermField[];
    if (fields.length === 0) {
      turn.say(["There are no extracted values for those fields, so there is nothing to apply."]);
      return;
    }
    const loanId = requireLoanId(loan);
    turn.advance();
    const proposal = this.propose(sessionId, {
      title: `Apply ${fields.length} term${fields.length === 1 ? "" : "s"} to ${loanId}`,
      summary: `From ${extraction.file.name}${Object.keys(overrides).length ? ", with your changes" : ""}. Policy findings stay open.`,
      params: fields.map(field => ({ label: FIELD_LABELS[field], value: formatTerm(field, terms[field]) })),
      action: { kind: "applyTerms", loanId, terms },
    });
    turn.note("Held for approval · applyLoanTerms", "Nothing happens until you approve it in the chat", "succeeded");
    turn.say([`Ready to write ${fields.length} field${fields.length === 1 ? "" : "s"} to ${loanId}. Nothing is written until you approve.`]);
    turn.propose(proposal);
  }

  private async compareHistory(turn: Turn, session: Session, message: string, loanHint?: string) {
    const loan = await this.resolveLoan(turn, session, message, loanHint);
    const loanId = requireLoanId(loan);
    const borrower = loan.borrower;
    if (!borrower) {
      throw new UserFacingError("The loan package does not name a borrower, so I can't find prior loans.");
    }
    const rows = await turn.step("LOS · listLoans", `borrower = ${borrower}`, () => this.tools.listLoans({ borrower }));
    const year = loanYear(loanId);
    const prior = rows
      .filter(row => row.loanId !== loanId && loanYear(row.loanId) < year)
      .sort((a, b) => a.loanId.localeCompare(b.loanId));
    turn.advance();
    if (prior.length === 0) {
      turn.say([`${borrower} has no loans before ${year} to compare with.`]);
      return;
    }

    // Every prior loan, and this markup, at once: none depends on another.
    const [priorResults, current] = await Promise.all([
      Promise.all(
        prior.map(async row => {
          const pkg = await this.priorPackage(turn, session, row.loanId);
          const agreement = pkg.documents.find(doc => filePattern("loan agreement")!.test(doc.name));
          return agreement ? { row, pkg, agreement, covenants: await this.covenantsFor(turn, session, agreement) } : { row, pkg };
        })
      ),
      this.currentCovenants(turn, session, loan),
    ]);
    // Results and citations in loan order, whatever order the calls finished in.
    const precedent: NonNullable<Session["precedent"]> = [];
    const missing: string[] = [];
    for (const entry of priorResults) {
      if (!("agreement" in entry) || !entry.agreement || !entry.covenants) {
        missing.push(entry.row.loanId);
        continue;
      }
      precedent.push({ loanId: entry.row.loanId, file: entry.agreement, covenants: entry.covenants });
      turn.cite(documentCitation(entry.pkg, entry.agreement.fileId, entry.agreement.name));
    }
    turn.advance();
    session.precedent = precedent;

    const columns = [
      ...precedent.map(entry => ({ label: entry.loanId, fields: entry.covenants })),
      { label: "this markup", fields: current.covenants },
    ];
    const row = (label: string, pick: (fields: CovenantFields) => string | undefined) => {
      const values = columns.map(column => pick(column.fields));
      const priorValues = new Set(values.slice(0, -1).filter(Boolean));
      const departs = values.at(-1) !== undefined && priorValues.size > 0 && !priorValues.has(values.at(-1));
      return {
        cells: [label, ...values.map(value => value ?? "—")],
        ...(departs ? { status: "warn" as const, note: "Departs from precedent" } : {}),
      };
    };
    const covenantRows = [
      row("LTV max", fields => (fields.ltvMax !== undefined ? `${fields.ltvMax}%` : undefined)),
      row("DSCR min", fields => (fields.dscrMin !== undefined ? `${fields.dscrMin}x` : undefined)),
      row("Testing", fields => fields.testFrequency),
      row("Guaranty", fields =>
        fields.guarantyType
          ? fields.guarantyType + (fields.guarantyCapPerPerson ? ` ${money(fields.guarantyCapPerPerson)} cap` : "")
          : undefined
      ),
      // Only where the document's guaranty was read: otherwise "none" would be a guess.
      row("Left out of guaranty", fields => (fields.guarantyExclusions?.length ? fields.guarantyExclusions.join(", ") : fields.guarantyType ? "none" : undefined)),
    ];
    const departures = covenantRows.filter(entry => entry.status).length;
    turn.say([
      `${borrower}'s executed loans against the ${loanId} markup: ` +
        (departures === 0
          ? "every covenant follows precedent."
          : `${count(departures, "covenant")} ${departures === 1 ? "departs" : "depart"} from precedent.`),
    ]);
    turn.block({
      type: "table",
      columns: ["Covenant", ...columns.map(column => (column === columns.at(-1) ? "This markup" : column.label))],
      rows: covenantRows,
      ...(missing.length ? { footnote: `No executed agreement in the package for ${missing.join(", ")}.` } : {}),
    });
    turn.cite(documentCitation(loan, current.file.fileId, current.file.name));
  }

  private async generateLetter(turn: Turn, session: Session, sessionId: string, message: string, loanHint?: string) {
    const loan = await this.resolveLoan(turn, session, message, loanHint);
    const loanId = requireLoanId(loan);
    const extraction = await this.extract(turn, session, loan, "term sheet");
    const findings = session.findings ?? evaluateTerms(extraction.result.terms, extraction.covenants);
    session.findings = findings;
    const userInput = this.letterPayload(loan, extraction, findings, session.precedent);
    const folderId = requireFolder(loan);
    const fileName = `${loanId}-Commitment-Letter`;
    turn.advance();

    // Ask Box before asking the officer: never hold an approval that can only fail.
    const readiness = await turn.step(
      "Box · check Doc Gen access",
      "template and loan folder, as the signed-in Box user",
      () => this.tools.checkDocGen(folderId),
      result => (result.ready ? "succeeded" : "failed")
    );
    if (!readiness.ready) {
      turn.say([
        `I can't generate the commitment letter for ${loanId} yet: Box Doc Gen isn't available to the signed-in Box user. Nothing was created.`,
      ]);
      turn.block({
        type: "checks",
        title: "Box Doc Gen",
        rows: readiness.items.map(item => ({
          label: item.what === "template" ? "Template" : "Loan folder",
          value: item.ok ? "Available" : "Not available",
          detail: item.ok ? item.detail : `${item.detail} To fix: ${item.fix}`,
          status: item.ok ? ("pass" as const) : ("fail" as const),
        })),
      });
      // The check ran; it's the approval hold after it that is skipped.
      turn.advance();
      turn.stoppedWith = [{ label: "Check again", prompt: INTENT_PROMPTS.generate_letter.prompt }];
      return;
    }
    turn.advance();

    const proposal = this.propose(sessionId, {
      title: `Generate commitment letter for ${loanId}`,
      summary: "Box Doc Gen fills all 15 template fields from the record, extraction, and policy findings.",
      params: [
        { label: "Borrower", value: String(loan.borrower ?? "") },
        { label: "Amount", value: formatTerm("loanAmount", extraction.result.terms.loanAmount) },
        { label: "Policy findings", value: `${findings.filter(f => f.verdict !== "within").length} open` },
        { label: "File", value: `${fileName}.pdf` },
      ],
      action: { kind: "generateLetter", loanId, folderId, fileName, userInput },
    });
    turn.note("Held for approval · create_docgen_batch", "Nothing happens until you approve it in the chat", "succeeded");
    turn.say([`Commitment letter for ${loanId} is ready to generate. Approve to create it in the loan folder.`]);
    turn.propose(proposal);
  }

  private async sendForSignature(turn: Turn, session: Session, sessionId: string, message: string) {
    const letter = session.letter;
    if (!letter) {
      // Only a letter generated in this session: an earlier file with the same name may be a failed attempt.
      throw new UserFacingError("Generate the commitment letter first; I only send a letter generated in this conversation.");
    }
    turn.advance();
    const email = emailAddress(message) ?? this.options.defaultSigner?.email;
    if (!email) {
      throw new UserFacingError("Who should sign? Reply with the signer's email address.");
    }
    const name = emailAddress(message) ? undefined : this.options.defaultSigner?.name;
    turn.advance();

    // Box Sign never gets a second request for the same letter: a retry after a
    // timeout or a partial success would create a duplicate for the signer.
    if (session.signature?.fileId === letter.fileId) {
      throw new UserFacingError(
        `A Box Sign request (${session.signature.requestId}) already exists for ${letter.fileName}, so I won't create another. Check it in Box Sign.`
      );
    }

    // Salesforce refuses signature outside Approved or Commitment: read the
    // current status, not the one from earlier in the conversation.
    const current = await turn.step("LOS · getLoanPackage", `${letter.loanId} · current status`, () => this.tools.getLoanPackage(letter.loanId));
    if (session.loan && session.loan.loanId === current.loanId) {
      session.loan = { ...session.loan, status: current.status, risk: current.risk };
    }
    if (!current.status || !(SIGNABLE_STATUSES as readonly string[]).includes(current.status)) {
      turn.note("Rule · signature status", `${current.status ?? "no status"} is not ${SIGNABLE_STATUSES.join(" or ")}`, "failed");
      turn.say([
        `${letter.loanId} is ${current.status ?? "without a status"}, so it can't go for signature yet. Salesforce allows signature once the loan is ${SIGNABLE_STATUSES.join(" or ")}, after Credit Committee approval is recorded. Nothing was sent.`,
      ]);
      turn.advance();
      turn.stoppedWith = [];
      return;
    }
    turn.advance();
    const proposal = this.propose(sessionId, {
      title: "Send commitment letter for signature",
      summary: "Creates a Box Sign request and stores the embed link on the loan record.",
      params: [
        { label: "Signer", value: name ? `${name} <${email}>` : email },
        { label: "Document", value: letter.fileName },
        { label: "Loan", value: letter.loanId },
      ],
      action: { kind: "sendForSignature", loanId: letter.loanId, fileId: letter.fileId, email, ...(name ? { name } : {}) },
    });
    turn.note("Held for approval · prepareSignatureRequest", "Nothing happens until you approve it in the chat", "succeeded");
    turn.say(["Ready to send the letter for signature. Approve to create the Box Sign request."]);
    turn.propose(proposal);
  }

  private async listLoans(turn: Turn, session: Session, message: string) {
    const borrowers = await this.borrowers(turn, session);
    const borrower = namedBorrowers(message, borrowers)[0];
    const status = loanStatus(message);
    const rows = await turn.step("LOS · listLoans", [borrower && `borrower = ${borrower}`, status && `status = ${status}`].filter(Boolean).join(", ") || "all loans", () =>
      this.tools.listLoans({ borrower, status })
    );
    if (rows.length === 0) {
      turn.say(["No loans match."]);
      return;
    }
    const shown = newestFirst(rows).slice(0, 10);
    turn.say([`${count(rows.length, "loan")}${borrower ? ` for ${borrower}` : ""}${status ? `, ${status}` : ""}, newest first.`]);
    turn.block({
      type: "table",
      columns: ["Loan", "Name", "Status", "Amount"],
      rows: shown.map(row => ({ cells: [row.loanId, row.name, row.status, row.amount ? money(row.amount) : "—"] })),
      ...(rows.length > shown.length ? { footnote: `${rows.length - shown.length} more not shown.` } : {}),
    });
  }

  // ── Shared steps ──────────────────────────────────────────────────────

  /**
   * Which loan: an ID in the message, then a borrower named in the message,
   * then the loan already in the conversation, then the page's loan. Never a
   * guess: with none of these, ask.
   */
  private async resolveLoan(
    turn: Turn,
    session: Session,
    message: string,
    loanHint: string | undefined,
    options: { preferLatest?: boolean } = {}
  ): Promise<LoanPackage> {
    const loan = await this.findLoan(turn, session, message, loanHint, options);
    turn.context(loan);
    turn.advance();
    return loan;
  }

  private async findLoan(
    turn: Turn,
    session: Session,
    message: string,
    loanHint: string | undefined,
    options: { preferLatest?: boolean }
  ): Promise<LoanPackage> {
    const explicit = loanReference(message);
    if (explicit) {
      return this.loadPackage(turn, session, explicit);
    }
    const borrowers = await this.borrowers(turn, session);
    const named = namedBorrowers(message, borrowers);
    if (named.length > 0) {
      const borrower =
        named.length === 1
          ? named[0]
          : (
              await turn.step("TypeSafe · which borrower", named.join(" / "), () =>
                this.decider.choose(
                  { message },
                  "Which borrower is the message about?",
                  Object.fromEntries(named.map(name => [name, name]))
                )
              )
            ).choice;
      const sameBorrower = session.loan?.borrower === borrower;
      if (sameBorrower && !options.preferLatest && session.loan) {
        return session.loan;
      }
      const rows = await turn.step("LOS · listLoans", `borrower = ${borrower}`, () => this.tools.listLoans({ borrower }));
      const latest = latestLoan(rows);
      if (!latest) {
        throw new UserFacingError(`I found no loans for ${borrower}.`);
      }
      turn.note("Rule · latest loan", `${latest.loanId}: newest ID in an active status`, "succeeded");
      return this.loadPackage(turn, session, latest.loanId);
    }
    if (session.loan) {
      return session.loan;
    }
    if (loanHint) {
      return this.loadPackage(turn, session, loanHint);
    }
    throw new UserFacingError("Which loan? Name the borrower or give a loan ID such as LN-2026-0003.");
  }

  private async loadPackage(turn: Turn, session: Session, reference: string): Promise<LoanPackage> {
    if (session.loan && (session.loan.loanId === reference || session.loan.recordId === reference)) {
      return session.loan;
    }
    const pkg = await turn.step("LOS · getLoanPackage", reference, () => this.tools.getLoanPackage(reference));
    if (!pkg.found || !pkg.loanId) {
      throw new UserFacingError(`I couldn't find loan ${reference}.`);
    }
    if (session.loan?.loanId !== pkg.loanId) {
      session.extraction = undefined;
      session.findings = undefined;
      session.precedent = undefined;
    }
    session.loan = pkg;
    return pkg;
  }

  private async borrowers(turn: Turn, session: Session): Promise<string[]> {
    if (!session.borrowers) {
      const rows = await turn.step("LOS · listLoans", "all borrowers", () => this.tools.listLoans({}));
      session.borrowers = [...new Set(rows.map(row => row.borrower).filter(Boolean))];
    }
    return session.borrowers;
  }

  /** Extract once per loan and document; later turns reuse it. */
  private async extract(turn: Turn, session: Session, loan: LoanPackage, message: string) {
    const loanId = requireLoanId(loan);
    const kind = documentKind(message);
    const cached = session.extraction?.loanId === loanId ? session.extraction : undefined;
    // "Validate those terms…" names no document: keep the one under discussion.
    if (cached && !kind) {
      return cached;
    }
    const file = await this.pickDocument(turn, loan, kind ?? "term sheet");
    if (cached && cached.file.fileId === file.fileId) {
      return cached;
    }
    // Terms and covenants come from separate Box AI calls on the same file: run them together.
    const [result, covenants] = await Promise.all([
      turn.step("LOS · extractLoanTerms", file.name, () => this.tools.extractLoanTerms(loanId, file.fileId)),
      filePattern("term sheet")!.test(file.name) ? this.covenantsFor(turn, session, file) : Promise.resolve(undefined),
    ]);
    if (!result.extracted) {
      throw new UserFacingError(`Box AI could not extract terms from ${file.name}.`);
    }
    session.extraction = { loanId, file, result, covenants };
    return session.extraction;
  }

  /** A file's covenants, extracted once per conversation (a failed call isn't kept, so it can be retried). */
  private covenantsFor(turn: Turn, session: Session, file: LoanDocument): Promise<CovenantFields> {
    session.covenants ??= new Map();
    let pending = session.covenants.get(file.fileId);
    if (!pending) {
      pending = turn.step("Box AI · extract covenants", file.name, () => this.tools.extractCovenants(file.fileId));
      session.covenants.set(file.fileId, pending);
      pending.catch(() => session.covenants?.delete(file.fileId));
    } else {
      turn.note("Box AI · extract covenants", `${file.name} · reused from earlier in this conversation`, "succeeded");
    }
    return pending;
  }

  /** A prior loan's package, read once per conversation. */
  private priorPackage(turn: Turn, session: Session, loanId: string): Promise<LoanPackage> {
    session.packages ??= new Map();
    let pending = session.packages.get(loanId);
    if (!pending) {
      pending = turn.step("LOS · getLoanPackage", loanId, () => this.tools.getLoanPackage(loanId));
      session.packages.set(loanId, pending);
      pending.catch(() => session.packages?.delete(loanId));
    }
    return pending;
  }

  private async currentCovenants(turn: Turn, session: Session, loan: LoanPackage) {
    const extraction = await this.extract(turn, session, loan, "term sheet");
    return { file: extraction.file, covenants: extraction.covenants ?? {} };
  }

  /** Documents by file-name rule; TypeSafe only breaks a tie between matches. */
  private async pickDocument(turn: Turn, loan: LoanPackage, kind: string): Promise<LoanDocument> {
    const pattern = filePattern(kind);
    const matches = pattern ? loan.documents.filter(doc => pattern.test(doc.name)) : [];
    if (matches.length === 1) {
      return matches[0];
    }
    if (matches.length === 0) {
      throw new UserFacingError(`There is no ${kind} in the ${loan.loanId} loan file.`);
    }
    const decision = await turn.step("TypeSafe · which document", `${matches.length} ${kind} files`, () =>
      this.decider.choose(
        { kind, files: matches.map(doc => doc.name) },
        `Which file is the current ${kind}?`,
        Object.fromEntries(matches.map(doc => [doc.fileId, doc.name]))
      )
    );
    return matches.find(doc => doc.fileId === decision.choice)!;
  }

  private propose(sessionId: string, spec: Omit<Proposal, "id"> & { action: Action }): Proposal {
    const { action, ...proposal } = spec;
    const full: Proposal = { id: `proposal-${++this.proposalCounter}`, ...proposal };
    this.pending.set(full.id, { sessionId, proposal: full, action });
    return full;
  }

  /** Run an approved write. What it produced is recorded on the session and saved. */
  private async run(sessionId: string, action: Action): Promise<ActionResult> {
    const session = this.session(sessionId);
    try {
      switch (action.kind) {
        case "applyTerms": {
          const result = await this.tools.applyLoanTerms(action.loanId, action.terms);
          return result.ok ? result.message : `The LOS refused: ${result.message}`;
        }
        case "generateLetter": {
          const result = await this.tools.generateCommitmentLetter({ folderId: action.folderId, fileName: action.fileName, userInput: action.userInput });
          if (!result.outputFileId) {
            return `Doc Gen accepted the batch${result.batchId ? ` (${result.batchId})` : ""} but the letter wasn't ready after 30 seconds, so it can't be sent for signature from here. Check the job in Box before generating again: a second batch makes a second letter.`;
          }
          session.letter = { loanId: action.loanId, fileId: result.outputFileId, fileName: `${action.fileName}.pdf` };
          session.signature = undefined;
          return {
            note: "Letter generated. Ask me to send it for signature when ready.",
            details: [{ label: "File", value: `${action.fileName}.pdf`, href: `https://app.box.com/file/${result.outputFileId}` }],
          };
        }
        case "sendForSignature": {
          const result = await this.tools.prepareSignatureRequest({
            loanId: action.loanId,
            fileId: action.fileId,
            signerEmail: action.email,
            signerName: action.name,
          });
          // A request that exists but isn't prepared still blocks a duplicate.
          if (result.requestId) session.signature = { fileId: action.fileId, requestId: result.requestId };
          if (!result.prepared) throw new Error(result.summary);
          return {
            note: result.summary,
            details: [
              ...(result.requestId ? [{ label: "Request", value: result.requestId }] : []),
              ...(result.embedUrl ? [{ label: "Signing page", value: "Open in Box Sign", href: result.embedUrl }] : []),
              ...(result.prepareUrl ? [{ label: "Review", value: "Open to review and send", href: result.prepareUrl }] : []),
            ],
          };
        }
      }
    } finally {
      this.save(sessionId);
    }
  }

  /** Save every conversation, most recently used first, up to MAX_SAVED_SESSIONS. */
  private save(sessionId: string) {
    const store = this.options.store;
    if (!store) return;
    this.usedAt.delete(sessionId);
    this.usedAt.set(sessionId, new Date().toISOString());
    const kept = [...this.usedAt.keys()].reverse().slice(0, MAX_SAVED_SESSIONS);
    for (const id of this.sessions.keys()) {
      if (!kept.includes(id)) this.forget(id);
    }
    store.save({
      version: 1,
      proposalCounter: this.proposalCounter,
      sessions: kept.map(id => {
        const { covenants: _covenants, packages: _packages, ...state } = this.sessions.get(id)!;
        return { id, usedAt: this.usedAt.get(id) ?? "", state };
      }),
      pending: [...this.pending.values()],
    });
  }

  private forget(sessionId: string) {
    this.sessions.delete(sessionId);
    this.usedAt.delete(sessionId);
    for (const [id, action] of this.pending) {
      if (action.sessionId === sessionId) this.pending.delete(id);
    }
  }

  /** The 15 Doc Gen paths (skills/loan-origination-claude/SKILL.md), from sourced data only. */
  private letterPayload(
    loan: LoanPackage,
    extraction: NonNullable<Session["extraction"]>,
    findings: PolicyFinding[],
    precedent: Session["precedent"]
  ): Record<string, unknown> {
    const terms = extraction.result.terms;
    const open = findings.filter(finding => finding.verdict !== "within");
    const approvers = [...new Set(open.map(finding => finding.approver).filter(Boolean))];
    return {
      loan: {
        id: loan.loanId,
        borrower: loan.borrower ?? "",
        loanAmount: formatTerm("loanAmount", terms.loanAmount),
        status: loan.status ?? "",
        termSheetReference: extraction.file.name,
      },
      terms: {
        policyAtIssue: [...new Set(findings.flatMap(finding => finding.policyIds))].join(", "),
        requestedPosition: termPairs(terms).map(({ label, value }) => `${label} ${value}`).join("; "),
        approvedPosition: findings.filter(f => f.verdict === "within").map(f => `${f.topic}: ${f.detail}`).join("; ") || "None within standard policy",
        exceptionPosition: open.length
          ? `${open.map(f => `${f.topic}: ${f.detail}`).join("; ")}. No exception approval is recorded.`
          : "No exceptions required",
        owner: approvers.length ? approvers.join(", ") : "Loan officer",
        risk: "Not recorded in the loan package",
        proposedTerms: termPairs(terms).map(({ label, value }) => `${label} ${value}`).join("; "),
      },
      precedent: {
        summary: precedent?.length
          ? precedent.map(entry => `${entry.loanId}: LTV max ${entry.covenants.ltvMax ?? "n/a"}%, DSCR ${entry.covenants.dscrMin ?? "n/a"}x ${entry.covenants.testFrequency ?? ""}`.trim()).join("; ")
          : "No precedent comparison was run for this letter",
      },
      letter: {
        preparedOn: (this.options.now?.() ?? new Date()).toISOString().slice(0, 10),
        preparedBy: "Loan Copilot (draft for loan officer review)",
      },
    };
  }

  private session(id: string): Session {
    let session = this.sessions.get(id);
    if (!session) {
      session = {};
      this.sessions.set(id, session);
    }
    return session;
  }
}

// ── Rendering helpers ───────────────────────────────────────────────────

/** "Harborview … 2026 (LN-2026-0003, Approved)", or just the ID and status. */
function loanPhrase(loan: LoanPackage): string {
  const aside = [loan.loanId, loan.status].filter(Boolean).join(", ");
  return loan.name ? `${loan.name}${aside ? ` (${aside})` : ""}` : aside;
}

function latestLoan(rows: LoanRow[]): LoanRow | undefined {
  const sorted = newestFirst(rows);
  return sorted.find(row => ACTIVE_STATUSES.has(row.status)) ?? sorted[0];
}

function loanYear(loanId: string): number {
  return Number(/^LN-(\d{4})/.exec(loanId)?.[1] ?? 0);
}

function requireLoanId(loan: LoanPackage): string {
  if (!loan.loanId) throw new UserFacingError("The loan package has no loan ID.");
  return loan.loanId;
}

function requireFolder(loan: LoanPackage): string {
  if (!loan.folderId) throw new UserFacingError(`${loan.loanId} has no governed Box folder.`);
  return loan.folderId;
}

export function formatTerm(field: TermField, value: number | string | undefined): string {
  if (value === undefined) return "n/a";
  const n = Number(value);
  switch (field) {
    case "loanAmount":
    case "collateralValue":
      return Number.isFinite(n) ? money(n) : String(value);
    case "interestRate":
    case "ltv":
      return `${value}%`;
    case "dscr":
      return `${value}x`;
    case "termMonths":
      return `${value} months`;
    default:
      return String(value);
  }
}

function termPairs(terms: Terms): Array<{ label: string; value: string }> {
  return (Object.keys(FIELD_LABELS) as TermField[])
    .filter(field => terms[field] !== undefined)
    .map(field => ({ label: FIELD_LABELS[field], value: formatTerm(field, terms[field]) }));
}

/** "1 term", "3 terms". */
function count(n: number, singular: string, plural = `${singular}s`): string {
  return `${n} ${n === 1 ? singular : plural}`;
}

const VERDICT_STATUS: Record<PolicyFinding["verdict"], CheckStatus> = {
  within: "pass",
  exception: "warn",
  outside: "fail",
  confirm: "warn",
  unknown: "info",
};

const VERDICT_LABEL: Record<PolicyFinding["verdict"], string> = {
  within: "Within policy",
  exception: "Needs exception",
  outside: "Outside policy",
  confirm: "Needs confirmation",
  unknown: "Not found",
};

/** "2 within policy, 1 needs an exception and 1 is outside policy." */
export function policySummary(findings: PolicyFinding[]): string {
  const n = (verdict: PolicyFinding["verdict"]) => findings.filter(finding => finding.verdict === verdict).length;
  const parts = [
    n("within") && `${n("within")} within policy`,
    n("exception") && `${n("exception")} ${n("exception") === 1 ? "needs an exception" : "need exceptions"}`,
    n("outside") && `${n("outside")} ${n("outside") === 1 ? "is" : "are"} outside policy`,
    n("confirm") && `${n("confirm")} ${n("confirm") === 1 ? "needs" : "need"} your confirmation`,
    n("unknown") && `${n("unknown")} couldn't be checked`,
  ].filter((part): part is string => Boolean(part));
  if (parts.length === 0) return "No policy checks applied.";
  const joined = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`;
  return `Of ${count(findings.length, "policy check")}, ${joined}.`;
}

const CHECK_STATUS: Record<FieldCheck["status"], CheckStatus> = {
  match: "pass",
  mismatch: "fail",
  new: "info",
  not_found: "info",
};

const CHECK_NOTE: Record<FieldCheck["status"], string | undefined> = {
  match: undefined,
  mismatch: "Mismatch",
  new: "Not on the record yet",
  not_found: "Not in the document",
};

function citePolicies(turn: Turn, findings: PolicyFinding[]) {
  for (const id of new Set(findings.flatMap(finding => finding.policyIds))) {
    turn.cite({ id, label: `${id} · ${POLICIES[id] ?? "Credit policy"}` });
  }
}

function documentCitation(loan: LoanPackage, fileId: string, name: string): Citation {
  const href = loan.documents.find(doc => doc.fileId === fileId)?.href ?? `https://app.box.com/file/${fileId}`;
  return { id: fileId, label: name, href };
}
