import { expect, test, type Page } from "@playwright/test";

/**
 * The built bundle is served with no org behind it. Where a test needs Salesforce to
 * answer, it answers at the network layer with exactly the JSON the Apex contract
 * specifies -- never with data the app might have invented for itself.
 */
const borrower = { isGuest: false, name: "Dana Whitfield", accountName: "Harborview Logistics", loginUrl: "https://example.invalid/login" };
const guest = { isGuest: true, loginUrl: "https://example.invalid/login" };

async function answerIdentity(page: Page, identity: unknown) {
  await page.route("**/services/apexrest/los/whoami", (route) => route.fulfill({ json: identity }));
}

test("loan workspace reports a failed read, and speaks for no loan it cannot name", async ({ page }) => {
  await page.goto("/?recordId=a01xx0000001234&loanId=LN-2026-0042&folderId=123");
  await expect(page).toHaveTitle(/Acme Bank/);
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

test("is Acme Bank's portal, with the rail and not the CLM top bar", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".cb-rail").getByText("Acme Bank")).toBeVisible();
  await expect(page.locator(".cb-rail").getByText("Borrower Portal")).toBeVisible();
  await expect(page.locator(".brand-mark")).toHaveText("AB");
  await expect(page.getByText(/Headless 360/)).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Start an application/ })).toBeVisible();
  // The palette is on :root, so anything on the page can be checked against it.
  const green = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--ab-green").trim());
  expect(green.toLowerCase()).toBe("#0f4c45");
});

test("a borrower with no loans lands on the application form", async ({ page }) => {
  await answerIdentity(page, borrower);
  await page.route("**/services/apexrest/los/loans", (route) => route.fulfill({ json: [] }));
  await page.goto("/");
  await expect(page.getByTestId("application-form")).toBeVisible();
  await expect(page).toHaveURL(/view=apply/);
  await expect(page.getByLabel("Borrowing entity")).toHaveValue("Harborview Logistics");
});

test("a guest is shown the sign-in prompt rather than a raw 403", async ({ page }) => {
  await answerIdentity(page, guest);
  await page.route("**/services/apexrest/los/loans", (route) =>
    route.fulfill({ status: 403, contentType: "application/json", body: '[{"errorCode":"FORBIDDEN","message":"You do not have access"}]' }),
  );
  await page.goto("/");
  await expect(page.getByTestId("loans-signed-out")).toBeVisible();
  await expect(page.getByTestId("data-error-signin")).toHaveAttribute("href", "https://example.invalid/login");
  await expect(page.getByTestId("loans-error")).toHaveCount(0);

  await page.goto("/?view=apply");
  await expect(page.getByTestId("apply-signed-out")).toBeVisible();
});

test("starting an application creates the record, provisions its folder, and opens the checklist", async ({ page }) => {
  const created = {
    recordId: "a01xx0000009newAAA",
    loanId: "LN-2026-0089",
    name: "Harborview Logistics Commercial Real Estate 2026",
    borrower: "Harborview Logistics",
    borrowerEntity: "Harborview Logistics",
    loanType: "Commercial Real Estate",
    status: "Application",
    loanAmount: 2400000,
    termMonths: 120,
    boxFolderId: null,
    purpose: "Purchase of the distribution facility at the port.",
  };
  const requests: string[] = [];
  await answerIdentity(page, borrower);
  await page.route("**/services/apexrest/los/loans", (route) => route.fulfill({ json: [] }));
  await page.route("**/services/apexrest/los/applications", async (route) => {
    requests.push("applications");
    expect(route.request().method()).toBe("POST");
    expect(route.request().postDataJSON()).toEqual({
      loanType: "Commercial Real Estate",
      loanAmount: 2400000,
      termMonths: 120,
      purpose: "Purchase of the distribution facility at the port.",
      borrowerEntity: "Harborview Logistics",
      collateralType: "Real Estate",
    });
    await route.fulfill({ status: 201, json: created });
  });
  await page.route("**/services/apexrest/los/box-folder**", (route) => {
    requests.push("box-folder");
    return route.fulfill({ json: { recordId: created.recordId, folderId: "987654321" } });
  });
  await page.route("**/services/apexrest/los/box-token**", (route) => {
    requests.push("box-token");
    return route.fulfill({ json: { accessToken: "example-scoped-token", folderId: "987654321" } });
  });
  await page.route("https://api.box.com/2.0/folders/987654321/items**", (route) => route.fulfill({ json: { entries: [] } }));
  await page.route("https://api.box.com/2.0/folders/987654321?**", (route) => route.fulfill({ json: { name: created.name } }));

  await page.goto("/?view=apply");
  await page.getByLabel("Loan type").selectOption("Commercial Real Estate");
  await page.getByLabel("Amount requested").fill("2,400,000");
  await page.getByLabel("Term in months").fill("120");
  await page.getByLabel("Purpose").fill("Purchase of the distribution facility at the port.");
  await page.getByLabel("Collateral").selectOption("Real Estate");
  await page.getByTestId("application-submit").click();

  await expect(page.getByTestId("required-documents")).toBeVisible();
  await expect(page.getByTestId("required-document-row")).toHaveCount(7);
  await expect(page.getByText("0 of 7 received.")).toBeVisible();
  await expect(page).toHaveURL(/recordId=a01xx0000009newAAA/);
  await expect(page).toHaveURL(/loanId=LN-2026-0089/);
  await expect(page).toHaveURL(/folderId=987654321/);
  // Create, then provision, then mint: the order the platform forces.
  expect(requests.slice(0, 3)).toEqual(["applications", "box-folder", "box-token"]);
  await expect(page.locator(".loan-banner")).toContainText("LN-2026-0089");
  await expect(page.getByText(/a01xx0000009newAAA/)).toHaveCount(0);
});
