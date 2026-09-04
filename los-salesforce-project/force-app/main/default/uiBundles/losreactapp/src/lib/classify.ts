import { apexFetch } from "./apexRest";
import { serverDetail } from "./applications";
import { describeError, failed, type Loaded } from "./loaded";
import { NOT_AUTHENTICATED } from "./loans";

/**
 * What Box AI decided a document is.
 *
 * `classified: false` is a legitimate answer, not a failure: Box AI could not name a type
 * in the losDocument enum, nothing was written, and the summary says the document was
 * received and is waiting for the loan officer. It is kept distinct from `ok: false`,
 * which means the request itself did not go through.
 */
export interface Classification {
  classified: boolean;
  documentType?: string;
  summary: string;
}

/**
 * Ask Salesforce to classify one uploaded file against the losDocument template.
 *
 * The call goes through Apex rather than to Box AI directly because the browser only
 * holds a token scoped to read and upload in one folder; extraction and the metadata write
 * run under the bank's own credential, and the endpoint refuses any file that is not in
 * this loan's folder.
 */
export async function classifyDocument(recordId: string, fileId: string): Promise<Loaded<Classification>> {
  const query = `recordId=${encodeURIComponent(recordId)}&fileId=${encodeURIComponent(fileId)}`;
  try {
    const response = await apexFetch(`/services/apexrest/los/classify?${query}`, {
      method: "POST",
      headers: { Accept: "application/json" },
    });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      if (response.status === 401 || text.includes("not_authenticated")) {
        return { ok: false, error: NOT_AUTHENTICATED };
      }
      return failed(serverDetail(text) || `Salesforce returned ${response.status} classifying the document.`);
    }
    const result = (await response.json()) as Partial<Classification> | null;
    if (!result || typeof result.classified !== "boolean" || typeof result.summary !== "string") {
      return failed("The classification endpoint answered without saying what it decided.");
    }
    return {
      ok: true,
      value: {
        classified: result.classified,
        summary: result.summary,
        ...(typeof result.documentType === "string" && result.documentType
          ? { documentType: result.documentType }
          : {}),
      },
    };
  } catch (error) {
    return failed(`The classification endpoint could not be reached. ${describeError(error)}`);
  }
}
