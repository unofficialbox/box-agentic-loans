/**
 * Box MCP server responses captured from a live enterprise (2026-09-24), with
 * IDs, logins and the enterprise scope replaced. The shapes and value types are
 * as Box returned them; the parsers in src/mcpTools.ts are tested against these.
 */

const person = { name: "Demo User", login: "demo.user@example.com", id: "100", type: "user" };
const at = (value: string) => ({ value });

/** search_files_metadata, asked for documentType and policyRisk: Box returns neither. */
export const searchFilesMetadata = {
  entries: [
    { id: "1001", type: "file", name: "harborview-term-sheet-2026-borrower-markup.pdf" },
    { id: "1002", type: "file", name: "Commercial Loan Commitment Letter (1).pdf" },
    { id: "1003", type: "file", name: "Commercial Loan Commitment Letter.pdf" },
  ],
  limit: 30,
};

/** get_file_details with fields ["id", "name", "metadata.enterprise_<id>.losDocument"]. */
export const fileDetailsWithMetadata = {
  extension: "pdf",
  metadata: {
    extraData: {
      enterprise: {
        losDocument: {
          canEdit: true,
          id: "00000000-0000-0000-0000-000000000001",
          type: "losDocument-00000000-0000-0000-0000-000000000002",
          typeVersion: 11,
          extraData: {
            $id: "00000000-0000-0000-0000-000000000001",
            $version: 0,
            $type: "losDocument-00000000-0000-0000-0000-000000000002",
            $parent: "file_1001",
            $typeVersion: 11,
            $template: "losDocument",
            $scope: "enterprise_1",
            borrowerEntity: "Harborview Logistics Holdings LLC",
            loanReference: "LOS-2026-Harborview",
            versionStatus: "Internal",
            aiSummaryStatus: "Complete",
            policyRisk: "Critical",
            documentType: "Term Sheet",
            approvalStatus: "Pending",
            signatureStatus: "Not Required",
            $canEdit: true,
          },
          parent: "file_1001",
          template: "losDocument",
          scope: "enterprise_1",
          version: 0,
        },
      },
    },
  },
  createdAt: at("2026-09-17T19:04:01.000Z"),
  modifiedAt: at("2026-09-17T19:04:01.000Z"),
  createdBy: person,
  modifiedBy: person,
  name: "harborview-term-sheet-2026-borrower-markup.pdf",
  id: "1001",
  etag: "0",
  type: "file",
};

/** get_file_details asking for plain "metadata": Box returns no metadata at all. */
export const fileDetailsWithoutMetadata = {
  extension: "pdf",
  createdAt: at("2026-09-17T19:04:01.000Z"),
  modifiedAt: at("2026-09-17T19:04:01.000Z"),
  createdBy: person,
  modifiedBy: person,
  name: "harborview-term-sheet-2026-borrower-markup.pdf",
  id: "1001",
  etag: "0",
  type: "file",
};

/** ai_extract_structured_from_fields with COVENANT_FIELDS on the 2026 markup: flat, numbers as numbers. */
export const covenantExtraction = {
  ltvMax: 75,
  dscrMin: 1.1,
  testFrequency: "annual",
  guarantyType: "limited",
  guarantyCapPerPerson: 1000000,
};

/** The guarantyExclusions field alone: on the 2026 markup, and on the 2025 executed agreement (no one left out). */
export const exclusionsFromMarkup = { guarantyExclusions: "Harborview Employee Holdings LP" };
export const exclusionsFromExecutedAgreement = {};

/** get_docgen_template_by_id: the name is `fileName`, not `name`. */
export const docgenTemplate = {
  fileName: "los-commitment-letter-template.docx",
  file: { type: "file", id: "2001" },
};

/** get_folder_details with default fields. */
export const folderDetails = {
  createdAt: at("2026-09-16T20:18:50.000Z"),
  modifiedAt: at("2026-09-17T20:21:04.000Z"),
  createdBy: person,
  modifiedBy: person,
  name: "Harborview Logistics Commercial Real Estate 2026_22",
  id: "3001",
  etag: "0",
  type: "folder",
};

/** Tool errors (isError: true), as the text Box returns. */
export const errors = {
  /** get_docgen_template_by_id for an ID that doesn't exist or can't be opened. */
  templateUnknown: "Internal Server Error",
  /** get_folder_details or get_file_details for an item the user can't see. */
  itemNotFound: "Item not found",
  /** create_docgen_batch with a template or folder the user can't see (from a live run). */
  docgenBatchNotFound: "Item not found",
};
