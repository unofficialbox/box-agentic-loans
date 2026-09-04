import { afterEach, describe, expect, test, vi } from "vitest";

const sdkFetch = vi.fn(async () => new Response("{}", { status: 201 }));
vi.mock("@salesforce/platform-sdk", () => ({
  createDataSDK: vi.fn(async () => ({ fetch: sdkFetch })),
  gql: (strings: TemplateStringsArray) => strings.join(""),
}));

import { apexFetch, apexRestUrl } from "./apexRest";

/**
 * Pinned because two plausible-looking URLs are both wrong against a signed-in session,
 * and one of them fails silently:
 *
 *   /services/apexrest/...      401 INVALID_SESSION_ID
 *   /loans/services/apexrest/...  200 with the SPA shell
 *
 * Only SFDC_ENV.apiPath reaches Apex.
 */
describe("Apex REST URLs", () => {
  afterEach(() => {
    delete (globalThis as { SFDC_ENV?: unknown }).SFDC_ENV;
  });

  test("goes through the bundle's apiPath", () => {
    (globalThis as { SFDC_ENV?: unknown }).SFDC_ENV = { apiPath: "/loans/sf/api", basePath: "/loans" };
    expect(apexRestUrl("/services/apexrest/los/box-token?recordId=a01")).toBe(
      "/loans/sf/api/services/apexrest/los/box-token?recordId=a01",
    );
  });

  test("does not use the site path, which serves the app rather than Apex", () => {
    (globalThis as { SFDC_ENV?: unknown }).SFDC_ENV = { apiPath: "/loans/sf/api", basePath: "/loans" };
    expect(apexRestUrl("/services/apexrest/los/loans")).not.toBe(
      "/loans/services/apexrest/los/loans",
    );
  });

  test("leaves the path alone off-platform, where the local harness serves it", () => {
    expect(apexRestUrl("/services/apexrest/los/loans")).toBe("/services/apexrest/los/loans");
  });
});

/**
 * Pinned because the gateway answers every write with an empty 401 unless the request
 * carries the surface's CSRF token, which only the Platform SDK's fetch knows how to get.
 */
describe("Apex REST writes", () => {
  afterEach(() => {
    delete (globalThis as { SFDC_ENV?: unknown }).SFDC_ENV;
    sdkFetch.mockClear();
    vi.unstubAllGlobals();
  });

  test("go through the Platform SDK on the bundle surface, with the bare path", async () => {
    (globalThis as { SFDC_ENV?: unknown }).SFDC_ENV = { apiPath: "/loans/sf/api", basePath: "/loans" };
    const plain = vi.fn();
    vi.stubGlobal("fetch", plain);
    const response = await apexFetch("/services/apexrest/los/applications", { method: "POST", body: "{}" });
    expect(response.status).toBe(201);
    expect(sdkFetch).toHaveBeenCalledWith("/services/apexrest/los/applications", { method: "POST", body: "{}" });
    expect(plain).not.toHaveBeenCalled();
  });

  test("use the plain fetch off-platform, where there is no gateway", async () => {
    const plain = vi.fn(async () => new Response("[]", { status: 200 }));
    vi.stubGlobal("fetch", plain);
    await apexFetch("/services/apexrest/los/applications", { method: "POST" });
    expect(plain).toHaveBeenCalledWith("/services/apexrest/los/applications", { method: "POST" });
    expect(sdkFetch).not.toHaveBeenCalled();
  });
});
