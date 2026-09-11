import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { ApplicationForm } from "./ApplicationForm";

const borrower = { isGuest: false, name: "Dana Whitfield", accountName: "Harborview Logistics" };

function fill(overrides: Partial<Record<string, string>> = {}) {
  const values = {
    "Loan type": "Commercial Real Estate",
    "Amount requested": "2,400,000",
    "Term in months": "120",
    Purpose: "Purchase of the distribution facility at the port.",
    ...overrides,
  };
  for (const [label, value] of Object.entries(values)) {
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
  }
}

describe("ApplicationForm", () => {
  afterEach(() => vi.unstubAllGlobals());

  test("offers the five loan types and prefills the borrowing entity from the account", () => {
    render(<ApplicationForm identity={borrower} onCreated={() => {}} />);
    const options = [...screen.getByLabelText("Loan type").querySelectorAll("option")].map((o) => o.textContent);
    expect(options).toEqual(["Choose one", "Term Loan", "Line of Credit", "Equipment Finance", "Commercial Real Estate", "SBA 7(a)"]);
    expect(screen.getByLabelText("Borrowing entity")).toHaveValue("Harborview Logistics");
  });

  test("keeps what the borrower typed for the entity when identity arrives later", () => {
    const { rerender } = render(<ApplicationForm identity={null} onCreated={() => {}} />);
    fireEvent.change(screen.getByLabelText("Borrowing entity"), { target: { value: "Harborview Holdings LLC" } });
    rerender(<ApplicationForm identity={borrower} onCreated={() => {}} />);
    expect(screen.getByLabelText("Borrowing entity")).toHaveValue("Harborview Holdings LLC");
  });

  test("refuses before the round trip and says which field", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<ApplicationForm identity={borrower} onCreated={() => {}} />);
    fill({ "Term in months": "3", Purpose: "short" });
    fireEvent.click(screen.getByTestId("application-submit"));

    expect(await screen.findByText(/between 6 and 360 months/)).toBeVisible();
    expect(screen.getByText(/sentence or two/)).toBeVisible();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("creates, then provisions the folder, then opens what the org returned", async () => {
    // Two requests in order, because Apex forbids a callout after DML in one transaction.
    // The workspace opens on the ids Salesforce and Box returned, never on ones composed here.
    const calls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      calls.push(`${init?.method} ${url}`);
      if (url.includes("/los/applications")) {
        return { ok: true, status: 201, json: async () => ({ recordId: "a01xx0000009abcAAA", loanId: "LN-2026-0089", name: "Harborview Logistics Commercial Real Estate 2026", status: "Application", loanType: "Commercial Real Estate" }) };
      }
      if (url.includes("/los/box-folder")) {
        return { ok: true, json: async () => ({ recordId: "a01xx0000009abcAAA", folderId: "987654321" }) };
      }
      throw new Error(`unexpected ${url}`);
    }));
    const onCreated = vi.fn();
    render(<ApplicationForm identity={borrower} onCreated={onCreated} />);
    fill();
    fireEvent.click(screen.getByTestId("application-submit"));

    await waitFor(() => expect(onCreated).toHaveBeenCalled());
    expect(calls).toEqual([
      "POST /services/apexrest/los/applications",
      "POST /services/apexrest/los/box-folder?recordId=a01xx0000009abcAAA",
    ]);
    expect(onCreated).toHaveBeenCalledWith(expect.objectContaining({
      recordId: "a01xx0000009abcAAA",
      loanId: "LN-2026-0089",
      boxFolderId: "987654321",
    }));
  });

  test("shows the server's sentence on refusal and invents no loan", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: false, status: 403, text: async () => '{"error":"no_borrower_account","detail":"Your sign-in is not linked to a borrower account yet."}',
    })));
    const onCreated = vi.fn();
    render(<ApplicationForm identity={borrower} onCreated={onCreated} />);
    fill();
    fireEvent.click(screen.getByTestId("application-submit"));

    expect(await screen.findByTestId("application-error")).toHaveTextContent("Your sign-in is not linked to a borrower account yet.");
    expect(onCreated).not.toHaveBeenCalled();
    expect(screen.queryByText(/LN-\d{4}-\d{4}/)).not.toBeInTheDocument();
  });

  test("still opens the loan when the folder could not be provisioned", async () => {
    // The record exists; sending the borrower back to the form would create a second
    // one. The workspace reports the folder failure, where the retry lives.
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.includes("/los/applications")) {
        return { ok: true, json: async () => ({ recordId: "a01xx0000009abcAAA", loanId: "LN-2026-0089" }) };
      }
      return { ok: false, status: 500, text: async () => "box unavailable" };
    }));
    const onCreated = vi.fn();
    render(<ApplicationForm identity={borrower} onCreated={onCreated} />);
    fill();
    fireEvent.click(screen.getByTestId("application-submit"));

    await waitFor(() => expect(onCreated).toHaveBeenCalled());
    expect(onCreated.mock.calls[0][0]).not.toHaveProperty("boxFolderId");
  });

  test("shows a guest the door, not the form", () => {
    render(<ApplicationForm identity={{ isGuest: true, loginUrl: "https://example.invalid/login" }} onCreated={() => {}} />);
    expect(screen.getByTestId("apply-signed-out")).toBeVisible();
    expect(screen.getByTestId("data-error-signin")).toHaveAttribute("href", "https://example.invalid/login");
    expect(screen.queryByTestId("application-form")).not.toBeInTheDocument();
  });

  test("previews the documents a loan type will ask for", () => {
    render(<ApplicationForm identity={borrower} onCreated={() => {}} />);

    expect(screen.getByTestId("application-required-preview")).toHaveTextContent("Property appraisal");
  });
});
