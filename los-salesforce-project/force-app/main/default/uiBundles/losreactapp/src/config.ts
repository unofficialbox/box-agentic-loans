const boxHostname = (import.meta.env.VITE_BOX_HOSTNAME || "").replace(/^https?:\/\//, "").replace(/\/$/, "");
const workspaceFolderId = import.meta.env.VITE_BOX_FOLDER_ID || "demo-workspace";

export const LOS_CONFIG = {
  workspace: {
    name: "LOS-2026-Dockwright",
    folderId: workspaceFolderId,
    boxHostname,
    boxUrl: boxHostname && workspaceFolderId !== "demo-workspace"
      ? `https://${boxHostname}/folder/${workspaceFolderId}`
      : "",
    boxAppUrl: import.meta.env.VITE_BOX_APP_URL || "",
    boxFormUrl: import.meta.env.VITE_BOX_FORM_URL || "",
  },
  folders: {
    borrowerDocs: import.meta.env.VITE_BOX_BORROWER_DOCS_FOLDER_ID || "",
    creditApproval: import.meta.env.VITE_BOX_CREDIT_APPROVAL_FOLDER_ID || "",
    closing: import.meta.env.VITE_BOX_CLOSING_FOLDER_ID || "",
    covenants: import.meta.env.VITE_BOX_COVENANTS_FOLDER_ID || "",
    docgen: import.meta.env.VITE_BOX_DOCGEN_FOLDER_ID || "",
  },
} as const;
