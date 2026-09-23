/**
 * Local-preview setting only. On the site the page gets its loan and folder
 * from the URL (see getLosPageContext), so a deployed bundle needs no env.
 * Unset, there is no folder: the token endpoint then refuses visibly.
 */
export const LOS_CONFIG = {
  workspace: {
    name: "LOS-2026-Harborview",
    folderId: import.meta.env.VITE_BOX_FOLDER_ID ?? "",
  },
} as const;
