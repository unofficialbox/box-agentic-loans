import { fireEvent, render, screen } from "@testing-library/react";
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
    expect(screen.queryByText("harborview-term-sheet-2026-markup.pdf")).not.toBeInTheDocument();
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
      screen.queryByRole("heading", { name: "Harborview Logistics Distribution Facility Loan 2026" }),
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
              { recordId: "a01xx0000009abcAAA", name: "Harborview Logistics Equipment Term Loan 2025", boxFolderId: "123456789" },
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
                name: "Harborview Logistics Distribution Facility Loan 2026",
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
