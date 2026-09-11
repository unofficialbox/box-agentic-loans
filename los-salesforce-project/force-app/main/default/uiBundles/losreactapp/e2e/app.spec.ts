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
  const favicon = await page.locator('link[rel="icon"]').getAttribute("href");
  expect(favicon).toMatch(/box-favicon.*\.ico$/);
  const iconResponse = await page.request.get(new URL(favicon!, page.url()).href);
  expect(iconResponse.ok()).toBe(true);
  expect((await iconResponse.body()).subarray(0, 4)).toEqual(Buffer.from([0, 0, 1, 0]));
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
  await expect(page.getByTestId("data-error-signin")).toHaveAttribute("href", "https://example.invalid/login?startURL=%2F");
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
    expect(new URL(route.request().url()).searchParams.get("recordId")).toBe(created.recordId);
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
  await expect(page.getByTestId("required-document-row")).toHaveCount(6);
  await expect(page.getByText("0 of 6 received.")).toBeVisible();
  await expect(page).toHaveURL(/recordId=a01xx0000009newAAA/);
  await expect(page).toHaveURL(/loanId=LN-2026-0089/);
  await expect(page).toHaveURL(/folderId=987654321/);
  // Create, then provision, then mint: the order the platform forces.
  expect(requests.slice(0, 3)).toEqual(["applications", "box-folder", "box-token"]);
  await expect(page.locator(".loan-banner")).toContainText("LN-2026-0089");
  await expect(page.getByText(/a01xx0000009newAAA/)).toHaveCount(0);
  let uploadBody = "";
  await page.route("https://*.box.com/**", async route => {
    const request = route.request();
    if (request.method() === "POST" && request.url().includes("files/content")) {
      uploadBody = request.postDataBuffer()?.toString() || "";
      await route.fulfill({json:{entries:[{id:"uploaded-file",type:"file",name:"upload-proof.pdf",parent:{id:"987654321"}}]}});
    } else {
      await route.fulfill({json:{upload_url:"https://upload.box.com/api/2.0/files/content"}});
    }
  });
  await page.getByTestId("required-document-upload").click();
  await expect(page.getByTestId("upload-dialog")).toBeVisible();
  await page.locator('input[type="file"]').first().setInputFiles({name:"upload-proof.pdf",mimeType:"application/pdf",buffer:Buffer.from("%PDF-1.4 test document")});
  await page.getByRole("button",{name:"Upload",exact:true}).click();
  await expect.poll(() => uploadBody).toContain('"parent":{"id":"987654321"}');
  expect(requests.filter(r => r === "box-token").length).toBeGreaterThanOrEqual(2);

});

test("a borrower cannot enable an officer surface and does not read Box with an upload token", async ({ page }) => {
  const boxReads: string[] = [];
  page.on("request", (req) => { if (req.url().includes("api.box.com")) boxReads.push(req.url()); });
  await answerIdentity(page, borrower);
  await page.route("**/services/apexrest/los/loans", (route) => route.fulfill({ json: [] }));
  await page.route("**/services/apexrest/los/box-token**", (route) => route.fulfill({ json: {
    accessToken: "example-upload-only", folderId: "123", borrower: true,
    files: [{ id: "101", name: "Borrower application.pdf", type: "file" }],
  } }));
  await page.goto("/?recordId=a01xx0000001234&surface=officer");
  await expect(page.getByText("Borrower application.pdf").first()).toBeVisible();
  await expect(page.getByText("Loan Officer", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /Open in Box/ })).toHaveCount(0);
  expect(boxReads).toEqual([]);
  await page.getByRole("button", { name: /Your loans/ }).click();
  await expect(page.getByTestId("loans-view")).toBeVisible();
});


test("signing opens on demand in the full canvas and returns to approved documents", async ({ page }) => {
  const loan = { recordId: "loan-one", name: "First loan", loanId: "LN-TEST-1", loanType: "Commercial Real Estate", status: "Approved", signEmbedUrl: "https://app.box.com/embed/sign/document/test" };
  await answerIdentity(page, borrower);
  await page.route("**/services/apexrest/los/loans", route => route.fulfill({ json: [loan] }));
  await page.route("**/services/apexrest/los/box-token**", route => route.fulfill({ json: {
    borrower: true, accessToken: "example-upload-only-token", folderId: "123", files: [{
      id: "file-one", name: "approved-appraisal.pdf", type: "file",
      metadata: { enterprise: { losDocument: { documentType: "Appraisal", versionStatus: "Draft", approvalStatus: "Approved" } } },
    }],
  } }));
  await page.route("**/services/apexrest/los/sign-status**", route => route.fulfill({ json: { status: "viewed" } }));
  await page.route(loan.signEmbedUrl, route => route.fulfill({ contentType: "text/html", body: "<p>Signing frame test fixture</p>" }));
  await page.goto("/?recordId=loan-one");
  const row = page.getByTestId("required-document-row").filter({ hasText: "approved-appraisal.pdf" });
  await expect(row.locator(".doc-status")).toHaveText("Approved");
  await expect(page.getByRole("table")).toHaveCount(1);
  for (const table of [page.getByTestId("required-documents").getByRole("table")]) {
    await expect(table.getByRole("columnheader")).toHaveText(["Name", "Type", "Status", "Last modified", "Size"]);
  }
  await expect(row.getByRole("cell").nth(2)).toHaveText("Approved");
  await expect(page.getByTitle("Box Sign Document")).toHaveCount(0);
  await page.getByRole("button", { name: "Review and sign" }).click();
  await expect(page.getByTitle("Box Sign Document")).toHaveAttribute("src", loan.signEmbedUrl);
  await expect(page.locator(".content-grid-aside")).toHaveCount(0);
  await expect(page.getByTestId("required-documents")).toBeHidden();
  await expect(page.getByRole("button", { name: "Back to documents" })).toHaveCSS("border-radius", "999px");
  await expect(page.getByRole("button", { name: "Back to documents" }).locator("svg")).toBeVisible();
  await page.getByRole("button", { name: "Back to documents" }).click();
  await expect(row.locator(".doc-status")).toHaveText("Approved");
  await page.reload();
  await expect(row.locator(".doc-status")).toHaveText("Approved");
  await expect(page.getByTitle("Box Sign Document")).toHaveCount(0);
  await page.getByRole("button", { name: "Review and sign" }).click();
  await expect(page.getByTitle("Box Sign Document")).toBeVisible();
  await page.getByRole("button", { name: "Your loans", exact: true }).click();
  await expect(page.getByTitle("Box Sign Document")).toHaveCount(0);
  await page.getByTestId("loan-row").getByRole("button").click();
  await expect(page.getByTitle("Box Sign Document")).toHaveCount(0);
  await page.getByRole("button", { name: "Review and sign" }).click();
  await expect(page.getByTitle("Box Sign Document")).toBeVisible();
});

test("completed signing returns to the loan and mapped folder without inflating charts", async ({ page }) => {
  let signed = false;
  const loan = { recordId: "loan-sign", name: "Signing loan", loanId: "LN-TEST-S", signEmbedUrl: "https://app.box.com/embed/sign/document/test-completion" };
  await answerIdentity(page, borrower);
  await page.route("**/services/apexrest/los/loans", route => route.fulfill({json:[{...loan,status:signed ? "Closed" : "Approved"}]}));
  await page.route("**/services/apexrest/los/sign-status**", route => route.fulfill({json:{status:signed ? "signed" : "viewed"}}));
  await page.route("**/services/apexrest/los/box-token**", route => route.fulfill({json:{borrower:true,accessToken:"example-upload-only",folderId:"123",files:[
    {id:"support",name:"appraisal.pdf",type:"file",metadata:{enterprise:{losDocument:{documentType:"Appraisal",approvalStatus:"Approved"}}}},
    {id:"copy",name:"Loan Commitment Letter.pdf",type:"file",metadata:{enterprise:{losDocument:{documentType:"Commitment Letter",approvalStatus:"Pending"}}}},
    {id:"log",name:"audit.pdf",type:"file",metadata:{enterprise:{losDocument:{documentType:"Signing Log",approvalStatus:"Pending"}}}},
    ...(signed ? [{id:"signed-output",name:"executed.pdf",type:"file",metadata:{enterprise:{losDocument:{documentType:"Signed Commitment Letter",approvalStatus:"Pending"}}}}] : []),
  ]}}));
  await page.route(loan.signEmbedUrl, route => route.fulfill({contentType:"text/html",body:"<p>Signing</p>"}));
  await page.goto("/?recordId=loan-sign");
  await expect(page.locator(".package-headline")).toHaveText("1 of 1 approved");
  await expect(page.getByTestId("workspace-metrics")).not.toContainText("Commitment Letter");
  await expect(page.getByTestId("box-table-row").filter({hasText:"Loan Commitment Letter.pdf"})).toContainText("Signing document");
  await page.getByRole("button",{name:"Review and sign"}).click();
  await expect(page.getByTitle("Box Sign Document")).toBeVisible();
  signed = true;
  await expect(page.getByText("Document signed successfully.")).toBeVisible({timeout:10000});
  await expect(page.getByTitle("Box Sign Document")).toHaveCount(0);
  await expect(page.getByText("Closed", {exact:true})).toBeVisible();
  await expect(page).toHaveURL(/recordId=loan-sign/);
  await expect(page).toHaveURL(/loanId=LN-TEST-S/);
  await expect(page).toHaveURL(/folderId=123/);
  await expect(page.getByTestId("box-table-row").filter({hasText:"executed.pdf"})).toContainText("Signed");
  await expect(page.getByTestId("box-table-row").filter({hasText:"audit.pdf"})).toContainText("Completed");
  await expect(page.getByTestId("document-timeline")).toContainText("executed.pdf");
  await page.getByRole("button", {name:"executed.pdf",exact:true}).click();
  await expect(page.getByTestId("box-preview-pane")).toBeVisible();
  await expect(page.getByTestId("workspace-metrics")).toHaveCount(0);
  await page.getByRole("button", {name:"All documents",exact:true}).click();
  await expect(page.getByRole("button", {name:"audit.pdf",exact:true})).toBeVisible();


  await expect(page.getByRole("button",{name:"Review and sign"})).toHaveCount(0);
  await expect(page.locator(".package-headline")).toHaveText("1 of 1 approved");
});

test("required documents uses skeleton rows until documents arrive", async ({ page }) => {
  await answerIdentity(page, borrower);
  await page.route("**/services/apexrest/los/loans", route => route.fulfill({ json: [
    { recordId: "loan-loading", loanId: "LN-TEST-L", loanType: "Commercial Real Estate" },
  ] }));
  let release!: () => void;
  const ready = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/services/apexrest/los/box-token**", async route => {
    await ready;
    await route.fulfill({ json: { borrower: true, accessToken: "example-test-token", folderId: "123", files: [] } });
  });
  await page.goto("/?recordId=loan-loading");
  const loading = page.getByTestId("required-documents-loading");
  await expect(loading).toBeVisible();
  await expect(loading.locator(".skeleton-row")).toHaveCount(6);
  await expect(loading.locator(".panel-head p")).toHaveCount(0);
  await expect(loading.getByText("Loading...", { exact: true })).toHaveCount(0);
  await page.screenshot({ path: "/tmp/required-documents-skeleton.png", fullPage: true });
  release();
  await expect(loading).toHaveCount(0);
  await expect(page.getByTestId("required-document-row")).toHaveCount(6);
});


test("expired workspace checks identity and signs in with the current loan return URL", async ({ page }) => {
  let expired = false;
  await page.route("**/services/apexrest/los/whoami", route => route.fulfill({ json: expired ? guest : borrower }));
  await page.route("**/services/apexrest/los/loans", route => route.fulfill({ json: [] }));
  await page.route("**/services/apexrest/los/box-token?**", route => {
    expired = true;
    return route.fulfill({ status: 403, json: { error: "FORBIDDEN" } });
  });
  const target = "/?recordId=a01xx0000009newAAA&loanId=LN-2026-0089";
  await page.goto(target);
  await expect(page.getByTestId("workspace-signed-out")).toBeVisible();
  await expect(page.getByRole("button", { name: "Try again" })).toHaveCount(0);
  const href = await page.getByTestId("data-error-signin").getAttribute("href");
  expect(new URL(href!).searchParams.get("startURL")).toBe(target);
  await page.screenshot({ path: "/tmp/loan-session-signin.png" });
  await page.route("https://example.invalid/login?**", route => route.fulfill({ contentType: "text/html", body: "<h1>Sign in</h1>" }));
  await page.getByTestId("data-error-signin").click();
  await expect(page).toHaveURL(href!);
});
