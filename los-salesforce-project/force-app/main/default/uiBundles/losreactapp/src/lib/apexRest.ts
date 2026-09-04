import { createDataSDK } from "@salesforce/platform-sdk";
import { sfdcEnv } from "./sfdcEnv";

/**
 * Build the URL for an Apex REST endpoint.
 *
 * A UI bundle reaches Apex through `SFDC_ENV.apiPath` -- "/loans/sf/api" on this site --
 * not through the bare path and not through the site prefix. Both of those were tried
 * against a signed-in session and neither works:
 *
 *   /services/apexrest/...        401 INVALID_SESSION_ID, a site session is not an API session
 *   /loans/services/apexrest/...    200 with the SPA shell, because an app-container site
 *                                 serves the React app for every path under its prefix
 *
 * The second is the dangerous one: it succeeds, so the caller fails parsing HTML as JSON
 * rather than seeing an error.
 *
 * Off-platform -- a standalone build, a test, the local harness -- there is no apiPath
 * and the bare path is what the harness serves.
 */
export function apexRestUrl(path: string): string {
  const apiPath = sfdcEnv()?.apiPath;
  return apiPath ? `${apiPath.replace(/\/+$/, "")}${path}` : path;
}

/**
 * Call an Apex REST endpoint with whatever the surface needs attached.
 *
 * A plain `fetch` through `apiPath` is enough for a GET, but the bundle's API gateway
 * answers every POST, PUT and PATCH with an empty 401 unless the request carries the
 * surface's CSRF token -- and the token comes from the gateway's own session endpoint,
 * not from a cookie or a meta tag the page could read. The Platform SDK's `fetch` owns
 * that exchange (it fetches the token, sends it as a header, and retries once when the
 * gateway rejects it), so every write goes through it. It resolves a bare
 * `/services/apexrest/...` path against `apiPath` itself, which is why `path` is passed
 * unprefixed here and prefixed by `apexRestUrl` everywhere else.
 *
 * Off-platform there is no SDK surface and no gateway; the local harness serves the
 * bare path, and a plain `fetch` is the whole story. The same is true on a surface whose
 * SDK has no `fetch` member -- the gateway would still refuse the write, and the caller
 * sees that as the status it is.
 */
export async function apexFetch(path: string, init?: RequestInit): Promise<Response> {
  if (sfdcEnv()?.apiPath) {
    try {
      const sdk = await createDataSDK();
      if (sdk?.fetch) {
        return sdk.fetch(path, init);
      }
    } catch (error) {
      console.info("[LOS] Platform SDK unavailable for this request; using the bundle API path.", error);
    }
  }
  return fetch(apexRestUrl(path), init);
}
