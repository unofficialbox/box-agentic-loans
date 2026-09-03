/**
 * The runtime context Salesforce injects into a UI bundle.
 *
 * The keys are `namespace`, `appName`, `basePath`, `apiPath` and `orgUrl`. There is no
 * `origin` -- reading one returns undefined, which is how this app spent a while pointing
 * Lightning Out and Apex REST at the wrong host.
 */
export interface SfdcEnv {
  /** Site path the app is served under, e.g. "/loans". */
  basePath?: string;
  /** Base path for API calls out of the bundle, e.g. "/loans/sf/api". */
  apiPath?: string;
  /** The org's Lightning origin, e.g. "https://<org>.lightning.force.com". */
  orgUrl?: string;
  appName?: string;
  namespace?: string;
}

export function sfdcEnv(): SfdcEnv | undefined {
  return (globalThis as { SFDC_ENV?: SfdcEnv }).SFDC_ENV;
}
