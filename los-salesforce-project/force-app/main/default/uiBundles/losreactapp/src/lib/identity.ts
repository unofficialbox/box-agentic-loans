import { apexRestUrl } from "./apexRest";
import { describeError, failed, type Loaded } from "./loaded";

/**
 * Who is signed in, and where they sign in or out.
 *
 * The sign-in and sign-out URLs come from the server because they cannot be worked out in
 * the browser: the site serves this bundle for every path beneath the app prefix, so
 * `/login` under it renders the app rather than a sign-in page. Salesforce knows the real
 * ones; configuration would only be a second copy to keep correct.
 */
export interface LosIdentity {
  isGuest: boolean;
  name?: string;
  /** The account whose loans this reader may see. Absent for a bank user. */
  accountName?: string;
  loginUrl?: string;
  logoutUrl?: string;
}

export async function fetchIdentity(): Promise<Loaded<LosIdentity>> {
  try {
    const response = await fetch(apexRestUrl("/services/apexrest/los/whoami"), {
      headers: { Accept: "application/json" },
    });
    if (!response.ok) {
      return failed(`Salesforce returned ${response.status} for the signed-in user.`);
    }
    const result = (await response.json()) as LosIdentity;
    // A response that cannot say whether this is a guest is not an identity. Treating a
    // malformed one as "signed in" would put an avatar over nobody.
    if (typeof result?.isGuest !== "boolean") {
      return failed("The identity endpoint answered without saying whether this is a guest.");
    }
    return { ok: true, value: result };
  } catch (error) {
    return failed(`The identity endpoint could not be reached. ${describeError(error)}`);
  }
}

/** Up to two initials, which is all the avatar has room for. */
export function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const letters = parts.length === 1 ? [parts[0][0]] : [parts[0][0], parts[parts.length - 1][0]];
  return letters.join("").toUpperCase();
}
