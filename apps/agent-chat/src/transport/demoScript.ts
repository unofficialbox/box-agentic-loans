import type {
  AgentActionProposal,
  AgentCitation,
} from "@unofficialbox/box-open-elements/patterns/agent-chat";

/**
 * Scripted replies for the demo beats in DEMO-CLICKPATH.md, built from the
 * seeded Harborview sample data (scripts/generate_sample_loan_assets.py and
 * sample-data/policies/approved). Used only when no agent backend is
 * configured, so the UI can be rehearsed offline.
 */

export type Intent =
  | "search_documents"
  | "extract_terms"
  | "validate_record"
  | "update_record"
  | "review_history"
  | "generate_letter"
  | "send_for_signature"
  | "list_loans"
  | "help";

export interface ToolCall {
  connector: "Box MCP" | "LOS MCP";
  tool: string;
  detail: string;
  /** A governance gate that held the call for approval instead of running it. */
  gated?: boolean;
}

export interface DemoBeat {
  intent: Intent;
  /** Lower-case phrases that route a prompt to this beat; more hits wins. */
  keywords: string[];
  tools: ToolCall[];
  /** The plan shown while the turn runs (Box AI's TodoList). */
  plan: string[];
  /** Prompt-library IDs to offer next. */
  next: string[];
  reply: string;
  citations: AgentCitation[];
  proposal?: Omit<AgentActionProposal, "id">;
  /** Note on the proposal once approved / rejected. */
  approvedNote?: string;
  rejectedNote?: string;
}

const doc = (id: string, label: string): AgentCitation => ({ id, label });

const TERM_SHEET = doc("term-sheet", "Term sheet · borrower markup");
const APPRAISAL = doc("appraisal", "Appraisal report 2026");
const LTV_POLICY = doc("LOS-LTV-001", "LOS-LTV-001 · LTV limit");
const DSCR_POLICY = doc("LOS-DSCR-001", "LOS-DSCR-001 · DSCR");
const GUAR_POLICY = doc("LOS-GUAR-001", "LOS-GUAR-001 · Guaranty");
const RATE_POLICY = doc("LOS-RATE-002", "LOS-RATE-002 · Relationship pricing");
const LOAN_2023 = doc("agreement-2023", "Executed agreement 2023");
const LOAN_2025 = doc("agreement-2025", "Executed agreement 2025");
const LOAN_RECORD = doc("loan-record", "LOS loan record");

export const DEMO_BEATS: DemoBeat[] = [
  {
    intent: "search_documents",
    plan: ["Find the borrower's latest loan", "Search losDocument metadata for critical risk", "List the flagged documents"],
    next: ["extract-check", "compare-history"],
    keywords: ["latest loan", "critical", "policy risk", "flagged", "which documents"],
    tools: [
      { connector: "LOS MCP", tool: "listLoans", detail: "borrower = Harborview Logistics, newest first" },
      { connector: "Box MCP", tool: "query_metadata", detail: "losDocument · policyRisk = 'Critical'" },
    ],
    reply: [
      "Latest loan: Harborview Distribution Facility Loan 2026 · $4.8M · Underwriting · risk High.",
      "",
      "Flagged critical policy risk:",
      "• Term sheet (borrower markup): 4 borrower changes to rate, guaranty, reporting and collateral",
      "• Appraisal: $5.65M as-is value puts LTV at 85%, over the 75% standard",
    ].join("\n"),
    citations: [TERM_SHEET, APPRAISAL],
  },
  {
    intent: "extract_terms",
    plan: ["Load the loan package", "Extract terms with Box AI", "Check credit policy", "Summarize findings"],
    next: ["validate-record", "compare-history"],
    keywords: ["extract", "term sheet", "credit policy", "marked-up", "markup"],
    tools: [
      { connector: "LOS MCP", tool: "getLoanPackage", detail: "governed document set for this loan" },
      { connector: "LOS MCP", tool: "extractLoanTerms", detail: "Box AI extract + credit policy Hub check" },
    ],
    reply: [
      "Extracted terms vs credit policy:",
      "• Amount $4.8M · term 120 mo · 25-yr amortization",
      "• Rate 6.85% fixed; borrower asks 6.50%. Relationship pricing allowed only with confirmed deposits",
      "• LTV 85%: outside policy. Standard max 75%, exception max 80%",
      "• DSCR 1.10x, annual test: outside policy. Minimum 1.25x, quarterly",
      "• Guaranty capped at $1M each, employee LP omitted: outside policy",
      "• FF&E ($850K) added to collateral value: excluded by policy",
    ].join("\n"),
    citations: [TERM_SHEET, LTV_POLICY, DSCR_POLICY, GUAR_POLICY, RATE_POLICY],
  },
  {
    intent: "validate_record",
    plan: ["Reuse the extracted terms", "Compare with the loan record"],
    next: ["apply-terms"],
    keywords: ["validate", "salesforce record", "against the record", "record"],
    tools: [
      { connector: "LOS MCP", tool: "getLoanPackage", detail: "current LOS_Loan__c values" },
    ],
    reply: [
      "Term sheet vs Salesforce record:",
      "• Amount $4.8M: matches",
      "• Term 120 mo: matches",
      "• Rate: record 6.85%, borrower markup 6.50%. Record holds the Bank's position",
      "• LTV: record 85% on the $5.65M appraisal. Borrower's $6.0M value is a broker opinion, not an appraisal",
    ].join("\n"),
    citations: [LOAN_RECORD, TERM_SHEET, APPRAISAL],
  },
  {
    intent: "update_record",
    plan: ["Collect the terms to apply", "Hold the write for your approval"],
    next: ["commitment-letter"],
    keywords: ["apply", "confirm", "write", "update the record"],
    tools: [
      { connector: "LOS MCP", tool: "applyLoanTerms", detail: "amount, rate, term · held for approval", gated: true },
    ],
    reply: "Ready to write the Bank's terms to the loan record. Approve to apply.",
    citations: [LOAN_RECORD],
    proposal: {
      title: "Apply terms to the LOS loan record",
      summary: "Writes the Bank's position, not the borrower markup. Policy exceptions stay open for Credit Risk.",
      params: [
        { label: "Amount", value: "$4,800,000" },
        { label: "Rate", value: "6.85% fixed" },
        { label: "Term", value: "120 months" },
      ],
    },
    approvedNote: "Applied to the loan record (demo mode: no write was made).",
    rejectedNote: "Not applied. The record is unchanged.",
  },
  {
    intent: "review_history",
    plan: ["Find prior executed loans", "Extract covenants from each agreement", "Compare with this markup"],
    next: ["commitment-letter"],
    keywords: ["compare", "covenant", "prior", "history", "executed loans"],
    tools: [
      { connector: "LOS MCP", tool: "listLoans", detail: "Harborview Logistics · status Closed" },
      { connector: "Box MCP", tool: "ai_qa_multi_file", detail: "2023 + 2025 agreements vs 2026 markup" },
    ],
    reply: [
      "Covenants: prior executed loans vs 2026 markup",
      "• LTV max: 70% (2023) · 70% (2025) · 2026 at 85%",
      "• DSCR: 1.30x quarterly (both) · 2026 asks 1.10x annual",
      "• Guaranty: unlimited, Pike + Voss (both) · 2026 capped at $1M each",
      "• Collateral: the 2026 FF&E claim cites the 2025 equipment loan, but that pool secures the 2025 loan, not this one",
    ].join("\n"),
    citations: [LOAN_2023, LOAN_2025, TERM_SHEET],
  },
  {
    intent: "generate_letter",
    plan: ["Load the loan package", "Build the 15 Doc Gen fields", "Hold generation for your approval"],
    next: ["send-signature"],
    keywords: ["commitment letter", "generate", "draft"],
    tools: [
      { connector: "LOS MCP", tool: "getLoanPackage", detail: "Doc Gen destination folder" },
      { connector: "Box MCP", tool: "create_docgen_batch", detail: "commitment letter template · held for approval", gated: true },
    ],
    reply: "Commitment letter is ready to generate with all 15 merge fields. Approve to create it in the loan folder.",
    citations: [TERM_SHEET, LOAN_RECORD],
    proposal: {
      title: "Generate commitment letter",
      summary: "Box Doc Gen fills the template from the record, extraction, and policy findings.",
      params: [
        { label: "Borrower", value: "Harborview Logistics" },
        { label: "Amount", value: "$4.8M" },
        { label: "Policy findings", value: "3 open" },
      ],
    },
    approvedNote: "Letter generated (demo mode: no file was created).",
    rejectedNote: "Not generated.",
  },
  {
    intent: "send_for_signature",
    plan: ["Find the letter generated in this session", "Confirm the signer", "Hold the Box Sign request for your approval"],
    next: [],
    keywords: ["signature", "sign ", "send"],
    tools: [
      { connector: "LOS MCP", tool: "prepareSignatureRequest", detail: "Box Sign · held for approval", gated: true },
    ],
    reply: "Signature requires the loan to be Approved or Commitment. Approve to send.",
    citations: [doc("commitment-letter", "Commitment letter (generated)")],
    proposal: {
      title: "Send commitment letter for signature",
      summary: "Creates a Box Sign request and stores the embed link on the loan record.",
      params: [
        { label: "Signer", value: "Jordan Pike, Harborview Logistics" },
        { label: "Document", value: "Commitment letter (generated)" },
      ],
    },
    approvedNote: "Signature request prepared (demo mode: nothing was sent).",
    rejectedNote: "Not sent. The letter stays in the loan workspace.",
  },
  {
    intent: "list_loans",
    plan: ["Query LOS loans by borrower and status"],
    next: ["compare-history"],
    keywords: ["closed loans", "loans does", "portfolio", "list loans"],
    tools: [{ connector: "LOS MCP", tool: "listLoans", detail: "borrower = Harborview Logistics, status = Closed" }],
    reply: [
      "2 closed loans for Harborview Logistics:",
      "• LN-2025-0148 · Equipment Term Loan 2025 · $2.15M",
      "• LN-2023-0311 · Revolving Line of Credit 2023 · $1.5M",
    ].join("\n"),
    citations: [],
  },
];

export const HELP_BEAT: DemoBeat = {
  intent: "help",
  plan: [],
  next: ["find-risk", "extract-check", "compare-history"],
  keywords: [],
  tools: [],
  reply: [
    "I can work the Harborview loan with you:",
    "• Find critical-risk documents",
    "• Extract terms and check credit policy",
    "• Compare with prior executed loans",
    "• Update the loan record, or generate and send the commitment letter (both need your approval)",
  ].join("\n"),
  citations: [],
};

/**
 * Stand-in for TypeSafe's intent routing: score each beat by keyword hits.
 * Confidence is the winner's share of all hits, so an ambiguous prompt reads
 * as low confidence exactly the way a TypeSafe `choice` answer would.
 */
export function routeIntent(prompt: string): { beat: DemoBeat; confidence: number } {
  const text = prompt.toLowerCase();
  const scored = DEMO_BEATS.map(beat => ({
    beat,
    hits: beat.keywords.filter(keyword => text.includes(keyword)).length,
  }));
  const total = scored.reduce((sum, entry) => sum + entry.hits, 0);
  const best = scored.reduce((top, entry) => (entry.hits > top.hits ? entry : top), scored[0]);
  if (total === 0 || best.hits === 0) {
    return { beat: HELP_BEAT, confidence: 0 };
  }
  return { beat: best.beat, confidence: best.hits / total };
}
