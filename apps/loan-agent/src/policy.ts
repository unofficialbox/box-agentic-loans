import type { CovenantFields } from "./tools.js";
import type { Terms } from "./los.js";

/**
 * The approved credit policy library (sample-data/policies/approved) as
 * rules. Same terms in → same findings out: no model reads the policy.
 */

/** "confirm": outside policy if a fact no tool returns holds; a person must check it. */
export type Verdict = "within" | "exception" | "outside" | "confirm" | "unknown";

export interface PolicyFinding {
  topic: "Loan-to-value" | "Debt service coverage" | "Pricing" | "Guaranty" | "Guarantors";
  verdict: Verdict;
  /** One line: the value and the rule it was measured against. */
  detail: string;
  policyIds: string[];
  /** Who must approve, when the verdict is an exception. */
  approver?: string;
}

export const POLICIES: Record<string, string> = {
  "LOS-LTV-001": "Standard LTV limit",
  "LOS-LTV-002": "LTV exception",
  "LOS-DSCR-001": "Standard DSCR",
  "LOS-DSCR-002": "DSCR exception",
  "LOS-RATE-001": "Pricing floor",
  "LOS-RATE-002": "Relationship pricing",
  "LOS-GUAR-001": "Standard guaranty",
  "LOS-GUAR-002": "Limited guaranty exception",
};

const num = (value: number | string | undefined): number | undefined => {
  const parsed = typeof value === "number" ? value : value === undefined ? NaN : Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

export function checkLtv(ltv: number | undefined): PolicyFinding {
  const policyIds = ["LOS-LTV-001", "LOS-LTV-002"];
  if (ltv === undefined) {
    return { topic: "Loan-to-value", verdict: "unknown", detail: "LTV not found in the document", policyIds };
  }
  if (ltv <= 75) {
    return { topic: "Loan-to-value", verdict: "within", detail: `${ltv}% within the 75% limit`, policyIds: ["LOS-LTV-001"] };
  }
  if (ltv <= 80) {
    return {
      topic: "Loan-to-value",
      verdict: "exception",
      detail: `${ltv}% needs the exception: 12-month interest reserve plus an additional guaranty`,
      policyIds,
      approver: "Chief Credit Officer",
    };
  }
  return { topic: "Loan-to-value", verdict: "outside", detail: `${ltv}% is above the 80% exception ceiling`, policyIds };
}

export function checkDscr(dscr: number | undefined, testFrequency?: string): PolicyFinding {
  const policyIds = ["LOS-DSCR-001", "LOS-DSCR-002"];
  if (dscr === undefined) {
    return { topic: "Debt service coverage", verdict: "unknown", detail: "DSCR not found in the document", policyIds };
  }
  if (testFrequency === "annual") {
    return {
      topic: "Debt service coverage",
      verdict: "outside",
      detail: `${dscr}x tested annually; policy requires a quarterly test`,
      policyIds,
    };
  }
  if (dscr >= 1.25) {
    return { topic: "Debt service coverage", verdict: "within", detail: `${dscr}x meets the 1.25x minimum`, policyIds: ["LOS-DSCR-001"] };
  }
  if (dscr >= 1.15) {
    return {
      topic: "Debt service coverage",
      verdict: "exception",
      detail: `${dscr}x needs the exception: six-month debt service reserve`,
      policyIds,
      approver: "Chief Credit Officer",
    };
  }
  return { topic: "Debt service coverage", verdict: "outside", detail: `${dscr}x is below the 1.15x exception floor`, policyIds };
}

/** SOFR is not in any tool response, so only the 6.50% absolute floor is checked. */
export function checkRate(rate: number | undefined): PolicyFinding {
  const policyIds = ["LOS-RATE-001", "LOS-RATE-002"];
  if (rate === undefined) {
    return { topic: "Pricing", verdict: "unknown", detail: "Rate not found in the document", policyIds };
  }
  if (rate >= 6.5) {
    return {
      topic: "Pricing",
      verdict: "within",
      detail: `${rate}% at or above the 6.50% floor (SOFR + 2.75% not checked)`,
      policyIds: ["LOS-RATE-001"],
    };
  }
  if (rate >= 6.0) {
    return {
      topic: "Pricing",
      verdict: "exception",
      detail: `${rate}% needs relationship pricing: $500K average deposits, confirmed from Bank records`,
      policyIds,
      approver: "Pricing Committee",
    };
  }
  return { topic: "Pricing", verdict: "outside", detail: `${rate}% is below the 6.00% relationship floor`, policyIds };
}

export function checkGuaranty(type: string | undefined, capPerPerson?: number): PolicyFinding {
  const policyIds = ["LOS-GUAR-001", "LOS-GUAR-002"];
  if (!type) {
    return { topic: "Guaranty", verdict: "unknown", detail: "Guaranty terms not found", policyIds };
  }
  if (type === "unlimited") {
    return { topic: "Guaranty", verdict: "within", detail: "Unlimited guaranty from owners", policyIds: ["LOS-GUAR-001"] };
  }
  if (type === "limited") {
    const cap = capPerPerson ? ` capped at ${money(capPerPerson)} each` : "";
    return {
      topic: "Guaranty",
      verdict: "exception",
      detail: `Limited${cap}: needs 25% cash collateral and every 20% owner covered`,
      policyIds,
      approver: "Loan Documentation and Credit Risk",
    };
  }
  return { topic: "Guaranty", verdict: "outside", detail: "No guaranty offered", policyIds };
}

/**
 * Every owner of 20% or more must guarantee, and leaving one out is outside
 * policy even under the limited-guaranty exception (LOS-GUAR-002). No tool
 * returns ownership yet, so a party the document leaves out is flagged for
 * the officer to confirm, not ruled on.
 */
export function checkGuarantyExclusions(excluded: string[] | undefined): PolicyFinding | undefined {
  if (!excluded?.length) return undefined;
  const who = excluded.length === 1 ? excluded[0] : `${excluded.slice(0, -1).join(", ")} and ${excluded.at(-1)}`;
  return {
    topic: "Guarantors",
    verdict: "confirm",
    detail: `${who} ${excluded.length === 1 ? "gives" : "give"} no guaranty. Confirm ownership: an owner of 20% or more left out is outside policy, even with the exception`,
    policyIds: ["LOS-GUAR-001", "LOS-GUAR-002"],
  };
}

export function evaluateTerms(terms: Terms, covenants?: CovenantFields): PolicyFinding[] {
  const findings = [
    checkLtv(num(terms.ltv)),
    checkDscr(num(covenants?.dscrMin) ?? num(terms.dscr), covenants?.testFrequency),
    checkRate(num(terms.interestRate)),
  ];
  if (covenants?.guarantyType) {
    findings.push(checkGuaranty(covenants.guarantyType, covenants.guarantyCapPerPerson));
  }
  const exclusions = checkGuarantyExclusions(covenants?.guarantyExclusions);
  if (exclusions) findings.push(exclusions);
  return findings;
}

export function money(value: number): string {
  return value >= 1_000_000
    ? `$${Number((value / 1_000_000).toFixed(2))}M`
    : `$${Math.round(value).toLocaleString("en-US")}`;
}
