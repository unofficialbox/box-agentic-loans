# Borrower workspace authorization

## Enforced boundary

`LosWorkspaceAccess` rejects guests, non-loan IDs, inaccessible loan records and borrower-account mismatches before `LosBoxTokenService` or `LosBoxFolderService` calls a privileged Box helper. Internal direct-folder requests additionally require the `LOS_Direct_Box_Folder` custom permission and a nonempty allowlist. `LOS_Demo_Operator` grants that capability; the borrower permission set does not.

A borrower workspace response contains a server-filtered, paginated document projection and a `base_upload` folder token. That token is not used for listing or preview. Only files whose metadata says Draft, Approved or Executed are included; missing metadata and Internal are denied. Risk and approval metadata are omitted even on visible files. Unknown classifications remain unavailable for preview until resolved.

For preview, the browser requests `recordId` and `fileId`; the server rechecks access and the current visible-file set, then exchanges a `base_preview` token bound to that one file. A stale or tampered file ID is refused. Issued tokens remain usable until Box expires them; metadata changes do not retroactively revoke an already-issued token. An upload token is a bearer capability: share it with no other user and refresh the workspace when the session changes.

The browser never decides officer authorization. The consolidated web app serves borrowers only. The optional Dreamforce metadata Explorer is retained as inactive source, not exposed through a URL or an account-name heuristic.

Box scope definitions: [official downscoping documentation](https://developer.box.com/guides/api-calls/permissions-and-errors/scopes). Source documents remain in Box; authorized metadata and extracted values cross the interfaces.

## Tests

`LosWorkspaceSecurityTest` covers guests, wrong object types, cross-account requests, restricted internal users, direct-folder capability/allowlist denial, Internal and unclassified documents, filtered metadata, upload-only grants and per-file previews. Existing token and provisioning suites remain active. React and Playwright checks prove the browser uses the safe response without reading Box with the upload token and ignores `surface=officer`.

The external account identity is injected in Apex unit tests because community-user provisioning depends on org licensing. A real signed-in borrower must separately prove same-account success and other-account refusal. Do not report that as complete from the fixture tests.

## Deployment and evidence

Deploy the Apex classes, custom permission, updated permission sets and React bundle together. Deploy the server before the UI. Reassigning an existing permission set is unnecessary when its definition is updated. Record the exact deployment ID, commit, target, checks and cleanup owner in private runtime evidence. Never overwrite readiness evidence with a claim based solely on unit tests.
