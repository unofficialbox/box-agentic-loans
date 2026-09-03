import { expect, test } from "@playwright/test";

test("loan workspace reports a failed read, and speaks for no loan it cannot name", async ({ page }) => {
  await page.goto("/?recordId=a01xx0000001234&loanId=LN-2026-0042&folderId=123");
  await expect(page).toHaveTitle(/Crestline Borrower Portal/);
  // No org behind the built bundle, so the workspace must say so rather than render the
  // synthetic folder it used to fall back to.
  await expect(page.getByTestId("box-error")).toBeVisible();
  await expect(page.getByTestId("agentforce-placeholder")).toHaveCount(0);
  // Deep-linked by record, so the app has ids but not the loan's fields. It used to
  // fill the banner from a fixture, which stated another loan's name, amount and term
  // as if they were this one's -- and put the Salesforce record id in front of a
  // borrower.
  await expect(page.locator(".loan-banner")).toHaveCount(0);
  await expect(page.getByText(/Salesforce a01xx0000001234/)).toHaveCount(0);
});

test("shows a borrower nothing of the bank's own underwriting process", async ({ page }) => {
  // The site serves the borrower; the loan officer works through the MCP server. The
  // underwriting review queue named the bank's reviewers and told the borrower which of
  // their own asks was holding up approval, and "Copy agent context" papered over a
  // limitation they should never meet. Both are gone, and this is what stops either
  // coming back by accident.
  await page.goto("/?recordId=a01xx0000001234&loanId=LN-2026-0042&folderId=123");
  await expect(page.getByRole("button", { name: /Your loans/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Underwriting reviews/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Copy agent context/ })).toHaveCount(0);
  await expect(page.getByText(/Loan Copilot/)).toHaveCount(0);
  await expect(page.getByTestId("approvals-view")).toHaveCount(0);
  await expect(page.getByText("Priya Shah")).toHaveCount(0);
});
