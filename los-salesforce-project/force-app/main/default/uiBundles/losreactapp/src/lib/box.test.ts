import { afterEach, describe, expect, test, vi } from "vitest";
import { fetchBoxFolderName, fetchDownscopedBoxToken, getLosPageContext, listBoxFolderItems, provisionBoxFolder } from "./box";

describe("LOS page context", () => {
  test("defaults to a workspace id the token endpoint will reject rather than serve", () => {
    expect(getLosPageContext("")).toEqual({
      loanId: "LN-2026-0042",
      folderId: "demo-workspace",
    });
  });
});

describe("Box folder listing", () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test("returns only files and passes the downscoped token as a bearer credential", async () => {
    let seenAuth = "";
    globalThis.fetch = (async (_url: string, init?: RequestInit) => {
      seenAuth = String((init?.headers as Record<string, string>)?.Authorization || "");
      return {
        ok: true,
        json: async () => ({
          entries: [
            { id: "1", name: "loan-application.pdf", type: "file" },
            { id: "2", name: "Subfolder", type: "folder" },
          ],
        }),
      };
    }) as unknown as typeof fetch;

    const items = await listBoxFolderItems("42", "scoped-token");
    expect(items).toEqual({ ok: true, value: [{ id: "1", name: "loan-application.pdf", type: "file" }] });
    expect(seenAuth).toBe("Bearer scoped-token");
  });

  test("reports the status and body when Box rejects the request", async () => {
    // The reason is the whole point: a 403 with cors_origin_not_whitelisted names the fix,
    // and it used to go to a console warning behind a page of fixtures.
    globalThis.fetch = (async () => ({
      ok: false,
      status: 403,
      text: async () => '{"code":"cors_origin_not_whitelisted"}',
      json: async () => ({}),
    })) as unknown as typeof fetch;

    const result = await listBoxFolderItems("42", "bad-token");
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toContain("403");
    expect(result.ok === false && result.error).toContain("cors_origin_not_whitelisted");
  });

  test("reports the exception when the request throws", async () => {
    globalThis.fetch = (async () => {
      throw new Error("network blocked");
    }) as unknown as typeof fetch;

    const result = await listBoxFolderItems("42", "scoped-token");
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toContain("network blocked");
  });

  test("returns an empty array for a folder that is genuinely empty", async () => {
    // A freshly provisioned loan folder has no files yet and is still live content.
    // Conflating this with a failure would put an error over a working workspace.
    globalThis.fetch = (async () => ({ ok: true, json: async () => ({ entries: [] }) })) as unknown as typeof fetch;
    expect(await listBoxFolderItems("42", "scoped-token")).toEqual({ ok: true, value: [] });
  });
});

describe("Downscoped token request", () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = originalFetch;
    delete window.__LOS_RUNTIME_CONFIG__;
  });

  test("asks by record id so the org's Box mapping picks the folder", async () => {
    let seenUrl = "";
    globalThis.fetch = (async (url: string) => {
      seenUrl = url;
      return { ok: true, json: async () => ({ accessToken: "example-scoped-token", folderId: "123456789" }) };
    }) as unknown as typeof fetch;

    const granted = await fetchDownscopedBoxToken({
      folderId: "demo-workspace",
      salesforceRecordId: "a0JNS000009dn8X2AQ",
    });

    expect(seenUrl).toContain("recordId=a0JNS000009dn8X2AQ");
    // The unusable default must not be sent alongside it.
    expect(seenUrl).not.toContain("folderId=");
    // The endpoint's answer wins: the caller never knew this folder.
    expect(granted).toEqual({ ok: true, value: { accessToken: "example-scoped-token", folderId: "123456789" } });
  });

  test("falls back to folderId when there is no record context", async () => {
    let seenUrl = "";
    globalThis.fetch = (async (url: string) => {
      seenUrl = url;
      return { ok: true, json: async () => ({ accessToken: "example-scoped-token", folderId: "123" }) };
    }) as unknown as typeof fetch;

    await fetchDownscopedBoxToken({ folderId: "123" });
    expect(seenUrl).toContain("folderId=123");
    expect(seenUrl).not.toContain("recordId=");
  });

  test("reports the refusal rather than handing back an empty token", async () => {
    globalThis.fetch = (async () => ({
      ok: false,
      status: 404,
      text: async () => '{"error":"no_box_folder_mapping"}',
      json: async () => ({}),
    })) as unknown as typeof fetch;

    const granted = await fetchDownscopedBoxToken({ folderId: "123", salesforceRecordId: "a0J" });
    expect(granted.ok).toBe(false);
    expect(granted.ok === false && granted.error).toContain("404");
  });

  test("uses the injected token from the local harness without calling Salesforce", async () => {
    window.__LOS_RUNTIME_CONFIG__ = { boxAccessToken: "example-harness-token" };
    globalThis.fetch = (async () => {
      throw new Error("must not call the endpoint");
    }) as unknown as typeof fetch;

    expect(await fetchDownscopedBoxToken({ folderId: "123456789" }))
      .toEqual({ ok: true, value: { accessToken: "example-harness-token", folderId: "123456789" } });
  });

  test("provisions the record's folder when it has none, then retries", async () => {
    // Provisioning writes the association and Apex forbids a callout after DML, so the
    // package cannot create the folder and mint in one request. Two calls is the design,
    // not a retry loop -- the second attempt is made once and only after provisioning.
    const calls: string[] = [];
    let provisioned = false;
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      const target = String(url);
      calls.push(`${init?.method || "GET"} ${target}`);
      if (target.includes("box-folder")) {
        provisioned = true;
        return { ok: true, json: async () => ({ folderId: "555" }) };
      }
      if (!provisioned) {
        return {
          ok: false,
          status: 404,
          text: async () => '{"error":"no_box_folder_mapping"}',
          json: async () => ({}),
        };
      }
      return { ok: true, json: async () => ({ accessToken: "example-scoped-token", folderId: "555" }) };
    }) as unknown as typeof fetch;

    const granted = await fetchDownscopedBoxToken({
      folderId: "demo-workspace",
      salesforceRecordId: "a01xx0000009abcAAA",
    });

    expect(granted).toEqual({ ok: true, value: { accessToken: "example-scoped-token", folderId: "555" } });
    expect(calls.filter((c) => c.includes("box-folder"))).toHaveLength(1);
    expect(calls.filter((c) => c.includes("box-token"))).toHaveLength(2);
    expect(calls[1]).toContain("POST");
  });

  test("does not provision when the failure is not a missing folder", async () => {
    const calls: string[] = [];
    globalThis.fetch = (async (url: string) => {
      calls.push(String(url));
      return { ok: false, status: 403, text: async () => '{"error":"folder_not_allowed"}', json: async () => ({}) };
    }) as unknown as typeof fetch;

    const granted = await fetchDownscopedBoxToken({ folderId: "123", salesforceRecordId: "a01xx0000009abcAAA" });
    expect(granted.ok).toBe(false);
    expect(granted.ok === false && granted.error).toContain("403");
    expect(calls.some((c) => c.includes("box-folder"))).toBe(false);
  });
});

describe("listBoxFolderItems", () => {
  function listing(entries: unknown[]) {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => ({ entries }) })),
    );
  }

  test("withholds an internal document from the borrower", async () => {
    // The downscoped token bounds which loan is reachable, not which documents within
    // it, so this filter is the only thing keeping the bank's credit memo off a
    // borrower's screen.
    listing([
      { id: "1", name: "loan-agreement-2025-executed.pdf", type: "file",
        metadata: { enterprise: { losDocument: { versionStatus: "Executed" } } } },
      { id: "2", name: "credit-memo-v4.pdf", type: "file",
        metadata: { enterprise: { losDocument: { versionStatus: "Internal" } } } },
    ]);

    const items = await listBoxFolderItems("123", "token");

    expect(items.ok === true && items.value.map((i) => i.name)).toEqual(["loan-agreement-2025-executed.pdf"]);
  });

  test("matches on version status, not on the file name", async () => {
    // A credit memo called anything is still internal; a document merely named "internal"
    // is not. Filtering on the name would get both backwards.
    listing([
      { id: "1", name: "v5-final.pdf", type: "file",
        metadata: { enterprise: { losDocument: { versionStatus: "Internal" } } } },
      { id: "2", name: "internal-controls-attestation.pdf", type: "file",
        metadata: { enterprise: { losDocument: { versionStatus: "Approved" } } } },
    ]);

    const items = await listBoxFolderItems("123", "token");

    expect(items.ok === true && items.value.map((i) => i.name)).toEqual(["internal-controls-attestation.pdf"]);
  });

  test("shows a file that carries no losDocument instance", async () => {
    // An untagged upload is a tagging gap to fix, not a document to hide -- vanishing
    // silently is worse than appearing.
    listing([{ id: "1", name: "just-uploaded.pdf", type: "file" }]);

    const items = await listBoxFolderItems("123", "token");

    expect(items.ok === true && items.value.map((i) => i.name)).toEqual(["just-uploaded.pdf"]);
  });
});

describe("fetchBoxFolderName", () => {
  test("reads the folder's own name with the scoped token", async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ id: "42", name: "Dockwright Logistics Distribution Facility Loan 2026" }) }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await fetchBoxFolderName("42", "scoped-token")).toEqual({
      ok: true,
      value: "Dockwright Logistics Distribution Facility Loan 2026",
    });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.box.com/2.0/folders/42?fields=name");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer scoped-token");
  });

  test("reports a failure instead of throwing so the heading can fall back", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 403, text: async () => "forbidden" })));
    const result = await fetchBoxFolderName("42", "scoped-token");
    expect(result.ok).toBe(false);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    expect((await fetchBoxFolderName("42", "scoped-token")).ok).toBe(false);
  });
});

describe("provisionBoxFolder", () => {
  afterEach(() => vi.unstubAllGlobals());

  test("posts by record and hands back the folder the package created", async () => {
    // Its own request, because the application form has just created the record in a
    // separate one: Apex forbids a callout after DML in a single transaction.
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ recordId: "a01", folderId: "555" }) }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await provisionBoxFolder("a01")).toEqual({ ok: true, value: { recordId: "a01", folderId: "555" } });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/services/apexrest/los/box-folder?recordId=a01");
    expect(init.method).toBe("POST");
  });

  test("reports the refusal with its reason rather than throwing", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 502, text: async () => '{"error":"box_unavailable"}' })));
    const result = await provisionBoxFolder("a01");
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toContain("502");
    expect(result.ok === false && result.error).toContain("box_unavailable");
  });
});

describe("file preview authorization", () => {
  test("requests a file grant bound to the selected loan", async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ accessToken: "example-file-preview" }) });
    vi.stubGlobal("fetch", fetcher);
    const { fetchBoxPreviewToken } = await import("./box");
    expect(await fetchBoxPreviewToken("loan-record", "101")).toEqual({ ok: true, value: "example-file-preview" });
    expect(fetcher.mock.calls[0][0]).toContain("recordId=loan-record&fileId=101");
  });
  test("does not substitute the upload token after a refused preview", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 403 }));
    const { fetchBoxPreviewToken } = await import("./box");
    expect((await fetchBoxPreviewToken("loan-record", "102")).ok).toBe(false);
  });
});
