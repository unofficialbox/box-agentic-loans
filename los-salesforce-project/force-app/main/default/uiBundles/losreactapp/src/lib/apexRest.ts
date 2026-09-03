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
