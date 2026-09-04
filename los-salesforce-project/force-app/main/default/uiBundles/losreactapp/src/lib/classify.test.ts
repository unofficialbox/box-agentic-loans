import { afterEach, describe, expect, test, vi } from "vitest";
import { classifyDocument } from "./classify";
import { NOT_AUTHENTICATED } from "./loans";

describe("classifyDocument", () => {
  afterEach(() => vi.unstubAllGlobals());

  test("posts the loan and file to the classify endpoint", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ classified: true, documentType: "Appraisal", summary: "An appraisal of the facility." }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await classifyDocument("a01xx0000009abcAAA", "42");

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/services/apexrest/los/classify?recordId=a01xx0000009abcAAA&fileId=42");
    expect(init.method).toBe("POST");
    expect(result).toEqual({
      ok: true,
      value: { classified: true, documentType: "Appraisal", summary: "An appraisal of the facility." },
    });
  });

  test("treats 'could not classify' as an answer, not a failure", async () => {
    // Box AI naming no type is legitimate: nothing was written and the loan officer will
    // classify it. That must stay distinct from the request itself failing.
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      json: async () => ({ classified: false, summary: "Received and awaiting the loan officer's classification." }),
    })));
    const result = await classifyDocument("a01", "1");
    expect(result.ok).toBe(true);
    expect(result.ok && result.value.classified).toBe(false);
    expect(result.ok && result.value.documentType).toBeUndefined();
  });

  test("maps a signed-out refusal and carries other refusals verbatim", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 401, text: async () => '{"error":"not_authenticated"}' })));
    expect(await classifyDocument("a01", "1")).toEqual({ ok: false, error: NOT_AUTHENTICATED });

    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: false, status: 404, text: async () => '{"error":"file_not_in_loan","detail":"That file is not in this loan\'s folder."}',
    })));
    expect(await classifyDocument("a01", "1")).toEqual({ ok: false, error: "That file is not in this loan's folder." });
  });

  test("refuses an answer that does not say what it decided", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({}) })));
    expect((await classifyDocument("a01", "1")).ok).toBe(false);
  });
});
