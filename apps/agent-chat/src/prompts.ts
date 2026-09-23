/**
 * The Loan Copilot prompt library, in Box AI's prompt shape
 * (`aiStaticPromptsSearch`: title, description, content, category,
 * department, industry). Categories use Box's taxonomy where one fits;
 * "Act" collects the governed writes, which Box's library has no category for.
 *
 * Every prompt here is one the agent can handle, in both demo and live mode.
 */

export type PromptCategory = "Research" | "Analyze" | "Create" | "Act";

export interface LibraryPrompt {
  id: string;
  title: string;
  description: string;
  content: string;
  category: PromptCategory;
  department: "Finance";
  industry: "Financial services";
}

export const CATEGORY_ORDER: PromptCategory[] = ["Research", "Analyze", "Create", "Act"];

const loanPrompt = (prompt: Omit<LibraryPrompt, "department" | "industry">): LibraryPrompt => ({
  ...prompt,
  department: "Finance",
  industry: "Financial services",
});

export const PROMPT_LIBRARY: LibraryPrompt[] = [
  loanPrompt({
    id: "find-risk",
    title: "Find critical risk",
    description: "Latest loan for a borrower and its documents flagged critical policy risk",
    content:
      "What's the latest loan for Harborview Logistics? Which documents in that loan are flagged critical policy risk?",
    category: "Research",
  }),
  loanPrompt({
    id: "list-closed",
    title: "Borrower's closed loans",
    description: "Portfolio view of a borrower's closed loans",
    content: "What closed loans does Harborview Logistics have with us?",
    category: "Research",
  }),
  loanPrompt({
    id: "extract-check",
    title: "Extract & check policy",
    description: "Pull terms from the marked-up term sheet and test them against credit policy",
    content: "Extract loan terms from the marked-up term sheet for that loan and check them against credit policy.",
    category: "Analyze",
  }),
  loanPrompt({
    id: "validate-record",
    title: "Validate record",
    description: "Compare extracted terms with the Salesforce loan record",
    content: "Validate those terms against the Salesforce record.",
    category: "Analyze",
  }),
  loanPrompt({
    id: "compare-history",
    title: "Compare history",
    description: "Covenants in prior executed loans vs this markup",
    content: "Compare the covenant terms across Harborview's prior executed loans and this 2026 markup.",
    category: "Analyze",
  }),
  loanPrompt({
    id: "commitment-letter",
    title: "Commitment letter",
    description: "Generate the commitment letter with Box Doc Gen (needs approval)",
    content: "Generate the commitment letter for this loan.",
    category: "Create",
  }),
  loanPrompt({
    id: "apply-terms",
    title: "Apply terms",
    description: "Write amount, rate and term to the loan record (needs approval)",
    content: "apply the amount, rate and term to the record, confirm",
    category: "Act",
  }),
  loanPrompt({
    id: "send-signature",
    title: "Send for signature",
    description: "Send the generated letter for Box Sign (needs approval)",
    content: "Send the commitment letter for signature.",
    category: "Act",
  }),
];

export function promptById(id: string): LibraryPrompt {
  const prompt = PROMPT_LIBRARY.find(entry => entry.id === id);
  if (!prompt) throw new Error(`Unknown prompt ${id}`);
  return prompt;
}

/** The clickpath order, for the chips shown before the first reply. */
export const STARTER_PROMPTS = ["find-risk", "extract-check", "compare-history", "commitment-letter"].map(promptById);
