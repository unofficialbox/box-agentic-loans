const boxHostname = (import.meta.env.VITE_BOX_HOSTNAME || "").replace(/^https?:\/\//, "").replace(/\/$/, "");

/**
 * Local-preview defaults only. On the site the page gets its loan and folder
 * from the URL (see getLosPageContext), so a deployed bundle needs no env.
 */
export const LOS_CONFIG = {
  workspace: {
    name: "LOS-2026-Harborview",
    folderId: import.meta.env.VITE_BOX_FOLDER_ID || "demo-workspace",
    boxHostname,
  },
} as const;
