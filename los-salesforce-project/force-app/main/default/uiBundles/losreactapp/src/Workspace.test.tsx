import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { Workspace } from "./Workspace";

// The real one pulls in box-ui-elements, which is megabytes and needs a live token. The
// panels these tests assert on are rendered by Workspace, not by this component.
vi.mock("./components/BoxElements", () => ({
  BoxElements: () => <div data-testid="box-elements-double" />,
}));

beforeEach(() => {
  window.history.replaceState({}, "", "/");
  Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("local demo")));
});

describe("Workspace", () => {
  test("opens on the loan list when the page carries no record context", async () => {
    render(<Workspace />);
    // Nothing identifies a loan yet, so the dashboard is the entry point rather than
    // a workspace. Salesforce is unreachable here, so it says so rather than inventing rows.
    expect(await screen.findByTestId("loans-error")).toBeVisible();
    expect(screen.queryByTestId("box-error")).not.toBeInTheDocument();
  });

  test("says why the workspace is unavailable instead of drawing a synthetic one", async () => {
    // Fixtures used to stand in here, so a workspace that could not authorise looked
    // identical to one that had -- a demo could run to the end against nothing.
    window.history.replaceState({}, "", "/?recordId=a01xx0000001234&folderId=123");
    render(<Workspace />);
    const failure = await screen.findByTestId("box-error");
    expect(failure).toBeVisible();
    expect(failure).toHaveTextContent(/could not be reached|returned/i);
    expect(screen.queryByText("dockwright-term-sheet-2026-markup.pdf")).not.toBeInTheDocument();
  });

  test("hides the panels built from the listing when the listing failed", async () => {
    // The history panel and the metric tiles are derived from the folder listing. Left up
    // on a failure they sit in a skeleton that will never resolve, which reads as slow
    // rather than broken.
    window.history.replaceState({}, "", "/?recordId=a01xx0000001234&folderId=123");
    render(<Workspace />);
    await screen.findByTestId("box-error");
    expect(screen.queryByTestId("timeline-loading")).not.toBeInTheDocument();
    expect(screen.queryByTestId("workspace-metrics")).not.toBeInTheDocument();
  });

  test("goes straight to the workspace when the page is opened on a record", async () => {
    // A Lightning or Experience page bound to one loan should not ask again.
    window.history.replaceState({}, "", "/?recordId=a01xx0000001234&folderId=123");
    render(<Workspace />);
    expect(await screen.findByTestId("box-error")).toBeVisible();
    expect(screen.queryByTestId("loans-view")).not.toBeInTheDocument();
  });

  test("shows a borrower nothing of the bank's own underwriting process", () => {
    // This app is the borrower's surface now; the loan officer works through the MCP
    // server. The underwriting review queue named the bank's own reviewers and told the
    // borrower which of their asks was holding up approval, and "Copy agent context" was a
    // workaround for a limitation they should never meet. Neither belongs in front of a
    // borrower.
    render(<Workspace />);
    expect(screen.queryByRole("button", { name: /Underwriting reviews/ })).not.toBeInTheDocument();
    expect(screen.queryByTestId("approvals-view")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Copy agent context/ })).not.toBeInTheDocument();
    expect(screen.queryByText("Priya Shah")).not.toBeInTheDocument();
  });

  test("the history shows a skeleton while loading, not an empty state", async () => {
    // "Nothing has been filed against this loan yet" is a claim about the folder. It
    // must not be made before the folder has been listed, so the panel distinguishes
    // not-known-yet from known-and-empty.
    window.history.replaceState({}, "", "/?recordId=a01xx0000001234&folderId=123");
    // Never resolves: the listing stays in flight for the life of the assertion.
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));

    render(<Workspace />);

    expect(await screen.findByTestId("timeline-loading")).toBeInTheDocument();
    expect(screen.queryByTestId("timeline-empty")).not.toBeInTheDocument();
  });

  test("carries no agent on the borrower's surface", async () => {
    // The Copilot ran as its own agent user rather than as the person signed in, and took
    // the loan it answered about from the conversation -- so no scoping on this page
    // reached it. It could read the credit memo and the credit policy library, which is
    // exactly what a borrower must not get.
    const { container } = render(<Workspace />);
    await screen.findByTestId("loans-error");
    expect(screen.queryByTestId("agentforce-placeholder")).not.toBeInTheDocument();
    expect(screen.queryByText(/Loan Copilot/i)).not.toBeInTheDocument();
    expect(container.querySelector(".agent-panel")).toBeNull();
  });

  test("shows no loan banner until a loan is open", async () => {
    // The banner used to fall back to a fixture, so the list was headed by another
    // loan's name, amount and term -- and by "Approval blocked", contradicting the
    // status on the row beneath it.
    const { container } = render(<Workspace />);
    await screen.findByTestId("loans-error");
    expect(container.querySelector(".loan-banner")).toBeNull();
    expect(screen.queryByText(/120 months/)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Dockwright Logistics Distribution Facility Loan 2026" }),
    ).not.toBeInTheDocument();
  });

  test("never shows the Salesforce record id to a borrower", async () => {
    // Internal plumbing. This page faces the borrower.
    window.history.replaceState({}, "", "/?recordId=a01xx0000001234&loanId=LN-99&folderId=123");
    render(<Workspace />);
    expect(screen.queryByText(/Salesforce a01xx0000001234/)).not.toBeInTheDocument();
  });

  test("keeps the bank's own risk assessment off the borrower's screen", async () => {
    // Risk_Rating__c is what the bank thinks of the loan, not a fact about it -- the same
    // category as the underwriting queue. It is also why the list went blank for a real
    // borrower: the field was in the GraphQL projection but withheld by the permission
    // set, and UI API rejects the whole query when one selected field is hidden, which
    // reads as "this borrower has no loans".
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => [
          {
            recordId: "a01xx0000009abcAAA",
            loanId: "LN-1",
            name: "A Loan",
            boxFolderId: "1",
            riskRating: "Critical",
          },
        ],
      })),
    );
    render(<Workspace />);
    await screen.findByTestId("loan-row");
    expect(screen.queryByText("Critical")).not.toBeInTheDocument();
    expect(screen.queryByText("Risk")).not.toBeInTheDocument();
  });

  test("names the loan list as the borrower's own", () => {
    render(<Workspace />);
    expect(screen.getByRole("button", { name: /Your loans/ })).toBeVisible();
  });

  test("does not narrate its own plumbing to a borrower", async () => {
    // The heading and blurb faced a developer: "LOS loans", read "over the GraphQL UI
    // API", resolving a folder "from the Box for Salesforce record mapping". None of that
    // means anything to the customer whose loans these are.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => [
          { recordId: "a01xx0000009abcAAA", loanId: "LN-1", name: "A", boxFolderId: "1" },
        ],
      })),
    );
    render(<Workspace />);
    await screen.findByTestId("loans-view");
    expect(screen.queryByText(/GraphQL UI API/)).not.toBeInTheDocument();
    expect(screen.queryByText(/record mapping/)).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "LOS loans" })).not.toBeInTheDocument();
  });


  test("asks by record so the package resolves or provisions the folder", async () => {
    // The package owns the association and provisions a folder for a record that has
    // none, so the record id is asked for even when a folder is already denormalised
    // onto the row -- that copy can fall behind the association.
    const urls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        urls.push(String(url));
        if (String(url).includes("/los/loans")) {
          return {
            ok: true,
            json: async () => [
              { recordId: "a01xx0000009abcAAA", name: "Dockwright Logistics Equipment Term Loan 2025", boxFolderId: "123456789" },
            ],
          };
        }
        throw new Error("no box endpoint in this test");
      }),
    );

    render(<Workspace />);
    fireEvent.click(await screen.findByTestId("loan-open"));

    await screen.findByTestId("box-error");
    const tokenCall = urls.find((url) => url.includes("box-token")) || "";
    expect(tokenCall).toContain("recordId=a01xx0000009abcAAA");
    expect(tokenCall).not.toContain("folderId=");
  });

  test("puts the loan in the address bar so it can be linked and reloaded", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (String(url).includes("/los/loans")) {
          return {
            ok: true,
            json: async () => [
              {
                recordId: "a01xx0000009abcAAA",
                loanId: "LN-2026-0042",
                name: "Dockwright Logistics Distribution Facility Loan 2026",
                boxFolderId: "123456789",
              },
            ],
          };
        }
        throw new Error("no box endpoint in this test");
      }),
    );

    render(<Workspace />);
    expect(window.location.search).toBe("");

    fireEvent.click(await screen.findByTestId("loan-open"));

    const params = new URLSearchParams(window.location.search);
    expect(params.get("folderId")).toBe("123456789");
    expect(params.get("recordId")).toBe("a01xx0000009abcAAA");
    expect(params.get("loanId")).toBe("LN-2026-0042");
  });

  test("an org with no loans says so instead of showing a fixture", async () => {
    // An empty list is a real answer. Showing the fixture here would claim Salesforce is
    // unreachable when it answered perfectly well.
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => [] })));

    render(<Workspace />);
    expect(await screen.findByTestId("loans-empty")).toBeVisible();
    expect(screen.queryByTestId("loans-fixture-note")).not.toBeInTheDocument();
    expect(screen.queryByTestId("loan-row")).not.toBeInTheDocument();
  });
});

describe("Workspace recovery", () => {
  test("brings the metrics and history back when a retry succeeds", async () => {
    // The workspace hides both panels while Box is failing, because they are derived from
    // a listing that never arrived. The failure was raised to the workspace and never
    // withdrawn, so a retry that worked left them hidden over a loaded workspace.
    window.history.replaceState({}, "", "/?recordId=a01xx0000001234&folderId=123");
    let tokenCalls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const target = String(url);
        if (target.includes("box-token")) {
          tokenCalls += 1;
          return tokenCalls === 1
            ? { ok: false, status: 500, text: async () => "{}", json: async () => ({}) }
            : { ok: true, json: async () => ({ accessToken: "example-scoped-token", folderId: "123" }) };
        }
        if (target.includes("api.box.com")) {
          return {
            ok: true,
            json: async () => ({
              entries: [
                { id: "1", name: "loan-agreement.pdf", type: "file", modified_at: "2026-07-01T00:00:00Z" },
              ],
            }),
          };
        }
        return { ok: true, json: async () => [] };
      }),
    );

    render(<Workspace />);

    await screen.findByTestId("box-error");
    expect(screen.queryByTestId("workspace-metrics")).not.toBeInTheDocument();
    expect(screen.queryByTestId("document-timeline")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Try again/ }));

    expect(await screen.findByTestId("workspace-metrics")).toBeVisible();
    expect(screen.queryByTestId("box-error")).not.toBeInTheDocument();
  });
});

describe("Navigation and the address bar", () => {
  test("returning to the loan list is reflected in the URL", async () => {
    // The tab changed the view and left the URL alone, so a reload re-read the loan
    // still named there and dropped the reader back into the workspace they had left.
    window.history.replaceState({}, "", "/?recordId=a01xx0000001234&loanId=LN-1&folderId=123");
    render(<Workspace />);
    await screen.findByTestId("box-error");

    fireEvent.click(screen.getByRole("button", { name: /Your loans/ }));

    expect(new URLSearchParams(window.location.search).get("view")).toBe("loans");
    // The loan stays named, so the Workspace tab can return to it.
    expect(window.location.search).toContain("recordId=a01xx0000001234");
  });

  test("a reloaded list URL opens the list, not the loan it still names", async () => {
    window.history.replaceState({}, "", "/?recordId=a01xx0000001234&folderId=123&view=loans");
    render(<Workspace />);
    expect(await screen.findByTestId("loans-error")).toBeVisible();
    expect(screen.queryByTestId("box-error")).not.toBeInTheDocument();
  });

  test("the workspace tab drops the marker so its URL reopens the workspace", async () => {
    window.history.replaceState({}, "", "/?recordId=a01xx0000001234&folderId=123&view=loans");
    render(<Workspace />);
    await screen.findByTestId("loans-error");

    fireEvent.click(screen.getByRole("button", { name: /Workspace/ }));

    expect(new URLSearchParams(window.location.search).has("view")).toBe(false);
    expect(await screen.findByTestId("box-error")).toBeVisible();
  });
});

describe("Signed out", () => {
  test("says the session ended rather than claiming the org has no loans", async () => {
    // The endpoint used to answer a guest with an empty list, so a visitor whose session
    // had expired was told "No loan records yet" -- a claim about the org made from a
    // fact about the visitor.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 401,
        text: async () => '{"error":"not_authenticated"}',
        json: async () => ({}),
      })),
    );

    render(<Workspace />);

    expect(await screen.findByTestId("loans-signed-out")).toBeVisible();
    expect(screen.queryByTestId("loans-empty")).not.toBeInTheDocument();
    expect(screen.queryByText(/No loan records yet/)).not.toBeInTheDocument();
  });

  test("still says empty when an authenticated reader genuinely has none", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => [] })));

    render(<Workspace />);

    expect(await screen.findByTestId("loans-empty")).toBeVisible();
    expect(screen.queryByTestId("loans-signed-out")).not.toBeInTheDocument();
  });
});

describe("The loan banner", () => {
  test("does not head the list of every loan with one loan's facts", async () => {
    // The selection survives a trip to the list, which is what lets the Workspace tab
    // return to it. The banner has to be gated on the view as well, or it states one
    // loan's name, amount and term above a list of all of them.
    const rows = [
      { recordId: "a01xx0000009abcAAA", loanId: "LN-1", name: "First Loan", boxFolderId: "1", loanAmount: 100 },
      { recordId: "a01xx0000009defAAA", loanId: "LN-2", name: "Second Loan", boxFolderId: "2", loanAmount: 200 },
    ];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        String(url).includes("/los/loans")
          ? { ok: true, json: async () => rows }
          : { ok: false, status: 500, text: async () => "{}", json: async () => ({}) },
      ),
    );

    const { container } = render(<Workspace />);
    fireEvent.click((await screen.findAllByTestId("loan-open"))[0]);
    expect(container.querySelector(".loan-banner")).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /Your loans/ }));

    expect(container.querySelector(".loan-banner")).toBeNull();
    // Still selected underneath, so the Workspace tab can go back to it.
    fireEvent.click(screen.getByRole("button", { name: /Workspace/ }));
    expect(container.querySelector(".loan-banner")).not.toBeNull();
  });
});

/**
 * The uploader is megabytes of lazy chunk and needs a live token. This double keeps the
 * one thing the workspace depends on: the dialog reporting which Box files a batch of
 * uploads produced.
 */
vi.mock("./components/UploadDialog", () => ({
  UploadDialog: ({ onUploaded, onClose }: { onUploaded?: (files: { id: string; name: string }[]) => void; onClose: () => void }) => (
    <div data-testid="upload-dialog-double">
      <button type="button" data-testid="finish-upload" onClick={() => onUploaded?.([{ id: "f-appraisal", name: "appraisal.pdf" }])}>
        finish
      </button>
      <button type="button" data-testid="close-upload" onClick={onClose}>close</button>
    </div>
  ),
}));

const borrower = { isGuest: false, name: "Dana Whitfield", accountName: "Dockwright Logistics", loginUrl: "https://example.invalid/login" };
const guest = { isGuest: true, loginUrl: "https://example.invalid/login" };

/** One fetch double for the whole app: identity, loans, and whatever else a test adds. */
function apiDouble(
  identity: unknown,
  loans: unknown[] | { status: number; body: string },
  extra: (url: string, init?: RequestInit) => unknown = () => { throw new Error("no such endpoint in this test"); },
) {
  return vi.fn(async (url: string, init?: RequestInit) => {
    const target = String(url);
    if (target.includes("/los/whoami")) return { ok: true, json: async () => identity };
    if (target.includes("/los/loans")) {
      return Array.isArray(loans)
        ? { ok: true, json: async () => loans }
        : { ok: false, status: loans.status, text: async () => loans.body, json: async () => ({}) };
    }
    return extra(target, init);
  });
}

const applicationLoan = {
  recordId: "a01xx0000009newAAA",
  loanId: "LN-2026-0089",
  name: "Dockwright Logistics Commercial Real Estate 2026",
  borrower: "Dockwright Logistics",
  loanType: "Commercial Real Estate",
  status: "Application",
  loanAmount: 2_400_000,
  termMonths: 120,
  boxFolderId: "987654321",
};

describe("Where a borrower lands", () => {
  test("a borrower with no loans lands on the application form", async () => {
    // The one thing they can do here is apply, so the form is the front door. The URL
    // follows, so a reload lands in the same place.
    vi.stubGlobal("fetch", apiDouble(borrower, []));
    render(<Workspace />);
    expect(await screen.findByTestId("application-form")).toBeVisible();
    await waitFor(() => expect(new URLSearchParams(window.location.search).get("view")).toBe("apply"));
    expect(screen.queryByTestId("loans-empty")).not.toBeInTheDocument();
  });

  test("a borrower with loans lands on the list, with a way to start another", async () => {
    vi.stubGlobal("fetch", apiDouble(borrower, [applicationLoan]));
    render(<Workspace />);
    expect(await screen.findByTestId("loan-row")).toBeVisible();
    expect(screen.queryByTestId("application-form")).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId("start-application"));
    expect(await screen.findByTestId("application-form")).toBeVisible();
    await waitFor(() => expect(new URLSearchParams(window.location.search).get("view")).toBe("apply"));
  });

  test("a URL that names the list is honoured even with no loans", async () => {
    window.history.replaceState({}, "", "/?view=loans");
    vi.stubGlobal("fetch", apiDouble(borrower, []));
    render(<Workspace />);
    expect(await screen.findByTestId("loans-empty")).toBeVisible();
    expect(screen.queryByTestId("application-form")).not.toBeInTheDocument();
  });

  test("a guest refused by the class gate sees the sign-in prompt, not a 403", async () => {
    // The site's guest profile has no access to the loan classes, so the platform answers
    // with a bare 403 before the class can send its own 401. Both mean "sign in".
    vi.stubGlobal("fetch", apiDouble(guest, { status: 403, body: '[{"errorCode":"FORBIDDEN"}]' }));
    render(<Workspace />);
    expect(await screen.findByTestId("loans-signed-out")).toBeVisible();
    expect(screen.queryByTestId("loans-error")).not.toBeInTheDocument();
    expect(screen.getByTestId("data-error-signin")).toHaveAttribute("href", "https://example.invalid/login?startURL=%2F");
  });

  test("a signed-in reader refused with 403 is told so rather than sent to sign in again", async () => {
    vi.stubGlobal("fetch", apiDouble(borrower, { status: 403, body: '[{"errorCode":"FORBIDDEN"}]' }));
    render(<Workspace />);
    expect(await screen.findByTestId("loans-error")).toBeVisible();
    expect(screen.queryByTestId("loans-signed-out")).not.toBeInTheDocument();
  });

  test("a guest who opens the form is shown the door instead", async () => {
    window.history.replaceState({}, "", "/?view=apply");
    vi.stubGlobal("fetch", apiDouble(guest, { status: 401, body: '{"error":"not_authenticated"}' }));
    render(<Workspace />);
    expect(await screen.findByTestId("apply-signed-out")).toBeVisible();
    expect(screen.queryByTestId("application-form")).not.toBeInTheDocument();
  });
});

describe("Starting an application", () => {
  test("creates the loan, provisions its folder, and opens the workspace on the org's ids", async () => {
    const calls: string[] = [];
    vi.stubGlobal("fetch", apiDouble(borrower, [], (url, init) => {
      calls.push(`${init?.method || "GET"} ${url}`);
      if (url.includes("/los/applications")) {
        return { ok: true, status: 201, json: async () => ({ ...applicationLoan, boxFolderId: null, purpose: "Purchase of the facility." }) };
      }
      if (url.includes("/los/box-folder")) return { ok: true, json: async () => ({ recordId: applicationLoan.recordId, folderId: "987654321" }) };
      if (url.includes("box-token")) return { ok: true, json: async () => ({ accessToken: "example-scoped-token", folderId: "987654321" }) };
      if (url.includes("api.box.com")) return { ok: true, json: async () => ({ entries: [] }) };
      throw new Error(`unexpected ${url}`);
    }));
    render(<Workspace />);
    await screen.findByTestId("application-form");
    fireEvent.change(screen.getByLabelText("Loan type"), { target: { value: "Commercial Real Estate" } });
    fireEvent.change(screen.getByLabelText("Amount requested"), { target: { value: "2400000" } });
    fireEvent.change(screen.getByLabelText("Term in months"), { target: { value: "120" } });
    fireEvent.change(screen.getByLabelText("Purpose"), { target: { value: "Purchase of the facility at the port." } });
    fireEvent.click(screen.getByTestId("application-submit"));

    // The empty checklist for a Commercial Real Estate loan: six rows, none received.
    expect(await screen.findByTestId("required-documents")).toBeVisible();
    expect(screen.getAllByTestId("required-document-row")).toHaveLength(6);
    expect(screen.getByText("0 of 6 received.")).toBeVisible();

    const params = new URLSearchParams(window.location.search);
    expect(params.get("recordId")).toBe(applicationLoan.recordId);
    expect(params.get("loanId")).toBe("LN-2026-0089");
    expect(params.get("folderId")).toBe("987654321");
    expect(params.has("view")).toBe(false);
    // Create, then provision, then mint -- in that order, because the record must exist
    // before the folder and the folder before the token.
    const order = calls.filter((c) => /applications|box-folder|box-token/.test(c)).map((c) => c.split(" ")[1]);
    expect(order[0]).toContain("/los/applications");
    expect(order[1]).toContain("/los/box-folder");
    expect(order[2]).toContain("box-token?recordId=" + applicationLoan.recordId);
    // The banner reads the org's answer, and the record id stays out of it.
    expect(screen.getByRole("heading", { name: applicationLoan.name })).toBeVisible();
    expect(screen.queryByText(/a01xx0000009newAAA/)).not.toBeInTheDocument();
  });
});

describe("Uploading a required document", () => {
  test("reloads the listing after upload and picks up server-side classification", async () => {
    window.history.replaceState({}, "", `/?recordId=${applicationLoan.recordId}&folderId=987654321`);
    let classified = false;
    let listingReads = 0;
    vi.stubGlobal("fetch", apiDouble(borrower, [applicationLoan], (url) => {
      if (url.includes("box-token")) return { ok: true, json: async () => ({ accessToken: "example-scoped-token", folderId: "987654321" }) };
      if (url.includes("/items")) {
        listingReads++;
        return { ok: true, json: async () => ({ entries: [{ id: "f-appraisal", name: "appraisal.pdf", type: "file",
          ...(classified ? { metadata: { enterprise: { losDocument: { documentType: "Appraisal", approvalStatus: "Pending" } } } } : {}),
        }] }) };
      }
      if (url.includes("api.box.com")) return { ok: true, json: async () => ({ name: "Loan files" }) };
      throw new Error(`unexpected ${url}`);
    }));
    render(<Workspace />);
    expect(await screen.findByTestId("awaiting-classification")).toHaveTextContent("appraisal.pdf");
    const readsBefore = listingReads;
    classified = true;
    fireEvent.click(screen.getByTestId("required-document-upload"));
    fireEvent.click(await screen.findByTestId("finish-upload"));
    await waitFor(() => expect(screen.getByTestId("required-documents")).toHaveTextContent("Pending"));
    expect(listingReads).toBeGreaterThan(readsBefore);
    expect(screen.queryByTestId("awaiting-classification")).not.toBeInTheDocument();
  });

  test("keeps the document table visible after the loan is approved", async () => {
    window.history.replaceState({}, "", `/?recordId=${applicationLoan.recordId}&folderId=987654321`);
    vi.stubGlobal("fetch", apiDouble(borrower, [{ ...applicationLoan, status: "Approved" }], (url) => {
      if (url.includes("box-token")) return { ok: true, json: async () => ({ accessToken: "example-scoped-token", folderId: "987654321" }) };
      if (url.includes("api.box.com")) return { ok: true, json: async () => ({ entries: [], name: "x" }) };
      throw new Error(`unexpected ${url}`);
    }));
    render(<Workspace />);
    await screen.findByTestId("box-preview");
    expect(screen.getByTestId("required-documents")).toBeVisible();
  });
});

describe("Visual identity", () => {
  test("is Acme Bank's borrower portal, and not the CLM portal it was forked from", async () => {
    render(<Workspace />);
    expect(screen.getByText("Acme Bank")).toBeVisible();
    expect(screen.getByText("Borrower Portal")).toBeVisible();
    expect(screen.queryByText(/Headless 360/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Start an application/ })).toBeVisible();
    expect(screen.getByRole("navigation", { name: "Primary" }).closest(".cb-rail")).not.toBeNull();
  });
});

describe("Server-authorized borrower documents", () => {
  test("uses the safe listing without spending the upload token on Box reads", async () => {
    window.history.replaceState({}, "", "/?recordId=a01xx0000001234&surface=officer");
    const fetcher = vi.fn(async (url: string) => {
      if (String(url).includes("/whoami")) return { ok: true, json: async () => borrower };
      if (String(url).includes("/box-token")) return { ok: true, json: async () => ({
        accessToken: "example-upload-only", folderId: "123", borrower: true,
        files: [{ id: "101", name: "Application.pdf", type: "file" }],
      }) };
      if (String(url).includes("api.box.com")) throw new Error("Borrower must not read Box with upload token");
      return { ok: true, json: async () => [] };
    });
    vi.stubGlobal("fetch", fetcher);
    render(<Workspace />);
    expect(await screen.findByRole("button", { name: "Application.pdf" })).toBeVisible();
    expect(screen.getAllByRole("table")).toHaveLength(1);
    expect(screen.queryByRole("link", { name: /Open in Box/ })).not.toBeInTheDocument();
    expect(screen.queryByText("Loan Officer")).not.toBeInTheDocument();
    expect(fetcher.mock.calls.some(([url]) => String(url).includes("api.box.com"))).toBe(false);
  });
});


test("an expired workspace session replaces API errors with a return-to-loan sign in", async () => {
  window.history.replaceState({}, "", "/?recordId=a01xx0000009newAAA&loanId=LN-2026-0089");
  vi.stubGlobal("fetch", apiDouble(borrower, [applicationLoan]));
  render(<Workspace />);
  await waitFor(() => expect(screen.getByText("Dana Whitfield")).toBeVisible());
  vi.stubGlobal("fetch", apiDouble(guest, { status: 403, body: "Forbidden" }));
  fireEvent(window, new Event("los:check-session"));
  const prompt = await screen.findByTestId("workspace-signed-out");
  expect(prompt).toHaveTextContent("Sign in to continue");
  const href = screen.getByTestId("data-error-signin").getAttribute("href")!;
  expect(new URL(href).searchParams.get("startURL")).toBe("/?recordId=a01xx0000009newAAA&loanId=LN-2026-0089");
  expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
});


test("focus detects an expired identity session and preserves its known sign-in URL", async () => {
  window.history.replaceState({}, "", "/?recordId=a01xx0000009newAAA");
  vi.stubGlobal("fetch", apiDouble(borrower, [applicationLoan]));
  render(<Workspace />);
  await waitFor(() => expect(screen.getByText("Dana Whitfield")).toBeVisible());
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 401 })));
  fireEvent(window, new Event("focus"));
  await screen.findByTestId("workspace-signed-out");
  expect(screen.getByTestId("data-error-signin")).toHaveAttribute("href", "https://example.invalid/login?startURL=%2F%3FrecordId%3Da01xx0000009newAAA");
});


test("session expiry hides an already loaded loan list", async () => {
  window.history.replaceState({}, "", "/?view=loans");
  vi.stubGlobal("fetch", apiDouble(borrower, [applicationLoan]));
  render(<Workspace />);
  await screen.findByTestId("loan-row");
  vi.stubGlobal("fetch", apiDouble(guest, []));
  fireEvent(window, new Event("focus"));
  await screen.findByTestId("loans-signed-out");
  expect(screen.queryByTestId("loan-row")).not.toBeInTheDocument();
});
