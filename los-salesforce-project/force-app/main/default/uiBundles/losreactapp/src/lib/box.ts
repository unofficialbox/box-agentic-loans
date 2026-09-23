import { LOS_CONFIG } from "../config";
import { apexFetch, apexRead, apexRestUrl } from "./apexRest";
import { describeError, failed, firstLine, type Loaded } from "./loaded";

declare global {
  interface Window {
    __LOS_RUNTIME_CONFIG__?: {
      boxAccessToken?: string;
      salesforceOrigin?: string;
    };
  }
}

export interface BoxFolderItem {
  id: string;
  name: string;
  type: string;
  /** Bytes, for the size column. Absent on items Box does not report it for. */
  size?: number;
  modified_at?: string;
  /**
   * When the document itself was last changed, as opposed to when it was uploaded here.
   * Box keeps the two separate, and this is the one a reader means by "last modified".
   */
  content_modified_at?: string;
  modified_by?: { name?: string };
  extension?: string;
  /**
   * The losDocument instance, requested inline with the listing.
   *
   * Box returns it under the literal key `enterprise` when the field is asked for as
   * `metadata.enterprise.losDocument` -- the shorthand for the caller's own enterprise,
   * which saves shipping an enterprise ID to the browser.
   */
  metadata?: { enterprise?: { losDocument?: { versionStatus?: string; documentType?: string; approvalStatus?: string } } };
}

/**
 * What a borrower does not get to see.
 *
 * An Internal document is the bank's own underwriting work -- the credit memo, the
 * analysis of the borrower's markup, and by implication what the bank was willing to
 * accept. The loan folder is downscoped to one loan, which bounds *which* loan's
 * documents are reachable, but not which documents within it, so the filter has to
 * happen here.
 *
 * Matching on `versionStatus` rather than on the file name is the difference between a
 * control and a coincidence: a credit memo named `v5-final.pdf` is still internal, and a
 * legitimate document with "internal" in its name is not. Files with no losDocument
 * instance are shown -- an untagged upload should be visible rather than silently
 * disappearing, and the tagging is what governs, so an untagged file is a tagging gap to
 * fix rather than a document to hide.
 */
const WITHHELD_VERSION_STATUS = "Internal";

/**
 * List a folder with the downscoped token.
 *
 * An empty array means the folder is genuinely empty, which a freshly provisioned
 * loan folder always is. That is a different answer from a listing that failed, and
 * the two must stay distinct -- conflating them makes a healthy empty folder look broken,
 * and used to make a broken one look healthy.
 *
 * A CORS rejection is the usual failure and Box reports it in the body as
 * cors_origin_not_whitelisted with the offending origin, so the body is carried into the
 * message rather than left in a console nobody has open.
 */
export async function listBoxFolderItems(
  folderId: string,
  accessToken: string,
): Promise<Loaded<BoxFolderItem[]>> {
  try {
    const response = await fetch(
      `https://api.box.com/2.0/folders/${encodeURIComponent(folderId)}/items` +
        `?fields=id,name,type,size,extension,modified_at,content_modified_at,modified_by,` +
        `${encodeURIComponent("metadata.enterprise.losDocument")}&limit=100`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!response.ok) {
      const detail = firstLine(await response.text().catch(() => ""));
      return failed(
        `Box returned ${response.status} listing folder ${folderId}.${detail ? ` ${detail}` : ""}`,
      );
    }
    const result = (await response.json()) as { entries?: BoxFolderItem[] };
    return {
      ok: true,
      value: (result.entries || []).filter(
        (entry) =>
          entry.type === "file" &&
          entry.metadata?.enterprise?.losDocument?.versionStatus !== WITHHELD_VERSION_STATUS,
      ),
    };
  } catch (error) {
    // A CORS rejection surfaces here as an opaque TypeError with no response to read.
    return failed(
      `Box could not be reached to list folder ${folderId}. Check the Box app's CORS ` +
        `domains. ${describeError(error)}`,
    );
  }
}

/**
 * The folder's own name, for the workspace heading. Read-only and non-fatal: a loan
 * folder is named by the Box for Salesforce package after the record, and the heading
 * should say that rather than a label from configuration. When it cannot be read the
 * caller falls back to the configured workspace name.
 */
export async function fetchBoxFolderName(
  folderId: string,
  accessToken: string,
): Promise<Loaded<string>> {
  try {
    const response = await fetch(
      `https://api.box.com/2.0/folders/${encodeURIComponent(folderId)}?fields=name`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!response.ok) {
      return failed(`Box returned ${response.status} reading folder ${folderId}.`);
    }
    const result = (await response.json()) as { name?: string };
    if (typeof result?.name !== "string" || !result.name) {
      return failed(`Box returned no name for folder ${folderId}.`);
    }
    return { ok: true, value: result.name };
  } catch (error) {
    return failed(`Box could not be reached to read folder ${folderId}. ${describeError(error)}`);
  }
}

export interface LosPageContext {
  loanId: string;
  folderId: string;
  salesforceRecordId?: string;
}

export function getLosPageContext(search = window.location.search): LosPageContext {
  const params = new URLSearchParams(search);
  const salesforceRecordId = params.get("recordId");
  return {
    loanId: params.get("loanId") || "LN-2026-0042",
    folderId: params.get("folderId") || LOS_CONFIG.workspace.folderId,
    ...(salesforceRecordId ? { salesforceRecordId } : {}),
  };
}

export interface BoxWorkspaceToken {
  borrower?: boolean;
  files?: BoxFolderItem[];
  folderName?: string;
  accessToken: string;
  /** The folder the endpoint actually minted for, which may differ from what was asked. */
  folderId: string;
}

/**
 * Ask Salesforce for a folder-scoped Box token.
 *
 * A Salesforce record id is the preferred input. The endpoint resolves the folder from
 * the Box for Salesforce package's own record-to-folder association, so the workspace
 * never has to know a Box folder id and one cannot be supplied from the URL. The folder
 * comes back in the response because the caller does not know it up front.
 *
 * `folderId` remains for pages with no record context and for the local harness. Opened
 * with neither, the folder is empty and the endpoint rejects it -- a visible failure
 * rather than the quiet trigger for a fixture.
 */
export async function fetchDownscopedBoxToken(
  context: { folderId: string; salesforceRecordId?: string },
): Promise<Loaded<BoxWorkspaceToken>> {
  const injectedToken = window.__LOS_RUNTIME_CONFIG__?.boxAccessToken;
  if (injectedToken) {
    return { ok: true, value: { accessToken: injectedToken, folderId: context.folderId } };
  }

  const recordId = context.salesforceRecordId;
  const query = recordId
    ? `recordId=${encodeURIComponent(recordId)}`
    : `folderId=${encodeURIComponent(context.folderId)}`;

  try {
    let granted = await requestToken(query, context.folderId);

    // A record with no folder yet is provisioned rather than refused. Provisioning writes
    // the association, and Apex forbids a callout after DML, so the package cannot create
    // the folder and mint a token in one request -- hence provision, then retry.
    if (!granted.accessToken && granted.needsFolder && recordId) {
      const provisioned = await provisionBoxFolder(recordId);
      if (provisioned.ok) {
        granted = await requestToken(query, context.folderId);
      }
    }
    if (!granted.accessToken) {
      return failed(granted.error || "Salesforce returned no Box token for this loan.");
    }
    return { ok: true, value: { accessToken: granted.accessToken, folderId: granted.folderId, borrower: granted.borrower, files: granted.files, folderName: granted.folderName } };
  } catch (error) {
    return failed(`The Box token endpoint could not be reached. ${describeError(error)}`);
  }
}

interface TokenAttempt extends BoxWorkspaceToken {
  /** The record has no Box folder yet, so provisioning it is worth a try. */
  needsFolder: boolean;
  /** Why no token came back, ready to render. Empty when one did. */
  error: string;
}

async function requestToken(query: string, requestedFolderId: string): Promise<TokenAttempt> {
  const response = await apexRead(apexRestUrl(`/services/apexrest/los/box-token?${query}`), {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    return {
      accessToken: "",
      folderId: "",
      needsFolder: detail.includes("no_box_folder_mapping"),
      error: `Salesforce returned ${response.status} for the Box token.${
        firstLine(detail) ? ` ${firstLine(detail)}` : ""
      }`,
    };
  }
  const result = (await response.json()) as Partial<BoxWorkspaceToken>;
  return {
    borrower: result.borrower,
    files: result.files,
    folderName: result.folderName,
    accessToken: result.accessToken || "",
    // Trust the endpoint's folder over the requested one; with a recordId it is the only
    // place the answer exists.
    folderId: result.folderId || requestedFolderId,
    needsFolder: false,
    error: result.accessToken ? "" : "Salesforce answered the token request without a token.",
  };
}

/**
 * Ask the Box for Salesforce package to create this record's workspace folder.
 *
 * Its own request, deliberately. Creating a loan record is DML and provisioning its
 * folder is a callout, and Apex forbids a callout after DML in one transaction -- so the
 * browser creates, then provisions, in that order. The token path calls this when a
 * record turns out to have no folder; the application form calls it straight after the
 * record is created, so the borrower's first upload has somewhere to land.
 *
 * A failure is reported rather than thrown; the caller decides whether to retry the token
 * or show the reason, and the refusal is what the reader sees either way.
 */
export async function provisionBoxFolder(
  recordId: string,
): Promise<Loaded<{ recordId: string; folderId?: string }>> {
  try {
    const response = await apexFetch(
      `/services/apexrest/los/box-folder?recordId=${encodeURIComponent(recordId)}`,
      { method: "POST", headers: { Accept: "application/json" } },
    );
    if (!response.ok) {
      const detail = firstLine(await response.text().catch(() => ""));
      return failed(
        `Salesforce returned ${response.status} creating the loan's Box folder.${detail ? ` ${detail}` : ""}`,
      );
    }
    const result = (await response.json().catch(() => ({}))) as { recordId?: string; folderId?: string };
    return {
      ok: true,
      value: {
        recordId: result.recordId || recordId,
        ...(result.folderId ? { folderId: result.folderId } : {}),
      },
    };
  } catch (error) {
    return failed(`Folder provisioning could not be reached. ${describeError(error)}`);
  }
}

/** A fresh file-bound preview grant; the server rechecks loan access and metadata. */
export async function fetchBoxPreviewToken(recordId: string, fileId: string): Promise<Loaded<string>> {
  try {
    const response = await apexRead(apexRestUrl(`/services/apexrest/los/box-token?recordId=${encodeURIComponent(recordId)}&fileId=${encodeURIComponent(fileId)}`), { headers: { Accept: "application/json" } });
    if (!response.ok) return failed("This document is not available for preview. Refresh the loan workspace.");
    const result = await response.json() as { accessToken?: string };
    return result.accessToken ? { ok: true, value: result.accessToken } : failed("No document preview token was returned.");
  } catch (error) {
    return failed(`The document preview could not be authorized. ${describeError(error)}`);
  }
}
