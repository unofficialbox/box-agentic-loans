import { afterEach, describe, expect, test, vi } from "vitest";
import { createApplication, serverDetail, validateApplication, type ApplicationInput } from "./applications";
import { NOT_AUTHENTICATED } from "./loans";

const valid: ApplicationInput = {
  loanType: "Commercial Real Estate",
  loanAmount: 2_400_000,
  termMonths: 120,
  purpose: "Purchase of the distribution facility at the port.",
  borrowerEntity: "Harborview Logistics",
  collateralType: "Real Estate",
};

describe("validateApplication", () => {
  test("accepts an application the server would accept", () => {
    expect(validateApplication(valid)).toEqual({});
  });

  test("mirrors the server's bounds so the refusal is shown beside the field", () => {
    // The endpoint answers with one sentence and no field name; the form has to say
    // which field before the round trip, and it has to agree with the server about why.
    expect(validateApplication({ ...valid, loanType: "Mortgage" })).toHaveProperty("loanType");
    expect(validateApplication({ ...valid, loanAmount: 0 })).toHaveProperty("loanAmount");
    expect(validateApplication({ ...valid, loanAmount: 50_000_001 })).toHaveProperty("loanAmount");
    expect(validateApplication({ ...valid, loanAmount: 50_000_000 })).toEqual({});
    expect(validateApplication({ ...valid, termMonths: 5 })).toHaveProperty("termMonths");
    expect(validateApplication({ ...valid, termMonths: 361 })).toHaveProperty("termMonths");
    expect(validateApplication({ ...valid, termMonths: 12.5 })).toHaveProperty("termMonths");
    expect(validateApplication({ ...valid, purpose: "short" })).toHaveProperty("purpose");
    expect(validateApplication({ ...valid, purpose: "x".repeat(2001) })).toHaveProperty("purpose");
    expect(validateApplication({ ...valid, collateralType: "Goodwill" })).toHaveProperty("collateralType");
  });
});

describe("createApplication", () => {
  afterEach(() => vi.unstubAllGlobals());

  test("posts the contract's body and hands back the loan the org created", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 201,
      json: async () => ({
        recordId: "a01xx0000009abcAAA",
        loanId: "LN-2026-0089",
        name: "Harborview Logistics Commercial Real Estate 2026",
        status: "Application",
        loanType: "Commercial Real Estate",
        purpose: valid.purpose,
        boxFolderId: null,
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await createApplication(valid);

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/services/apexrest/los/applications");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
    expect(JSON.parse(String(init.body))).toEqual({
      loanType: "Commercial Real Estate",
      loanAmount: 2_400_000,
      termMonths: 120,
      purpose: valid.purpose,
      borrowerEntity: "Harborview Logistics",
      collateralType: "Real Estate",
    });
    expect(result.ok && result.value.loanId).toBe("LN-2026-0089");
  });

  test("sends no account id, whatever the caller supplies", async () => {
    // The borrower can only ever apply for their own account; the endpoint resolves it
    // from the session and the body carries nothing that could redirect it.
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ recordId: "a01" }) }));
    vi.stubGlobal("fetch", fetchMock);
    await createApplication({ ...valid, accountId: "001xx" } as ApplicationInput);
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(String(init.body)).not.toContain("accountId");
  });

  test("surfaces being signed out as its own state", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: false, status: 401, text: async () => '{"error":"not_authenticated","detail":"Sign in."}',
    })));
    expect(await createApplication(valid)).toEqual({ ok: false, error: NOT_AUTHENTICATED });
  });

  test("carries the server's own sentence through a refusal", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: false, status: 400,
      text: async () => '{"error":"invalid_application","detail":"Term must be between 6 and 360 months."}',
    })));
    const result = await createApplication(valid);
    expect(result).toEqual({ ok: false, error: "Term must be between 6 and 360 months." });
  });

  test("refuses to open a loan the org did not name", async () => {
    // A 200 with no record id is not an application. Inventing one here would put a
    // workspace in front of a record that does not exist.
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ loanId: "LN-2026-0001" }) })));
    const result = await createApplication(valid);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toMatch(/which loan/);
  });

  test("reports an unreachable endpoint rather than throwing", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    const result = await createApplication(valid);
    expect(result.ok === false && result.error).toContain("Failed to fetch");
  });
});

describe("serverDetail", () => {
  test("prefers the detail sentence, then the error code, then the first line", () => {
    expect(serverDetail('{"error":"x","detail":"A sentence."}')).toBe("A sentence.");
    expect(serverDetail('{"error":"no_borrower_account"}')).toBe("no borrower account");
    expect(serverDetail("<html>\n<body>")).toBe("<html>");
  });
});
