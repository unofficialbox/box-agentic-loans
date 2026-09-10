import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { FilePlus2, FileStack, LayoutDashboard } from "lucide-react";
import { ApplicationForm } from "./components/ApplicationForm";
import { BoxWorkspace } from "./components/BoxWorkspace";
import { DocumentTimeline } from "./components/DocumentTimeline";
import { RequiredDocuments } from "./components/RequiredDocuments";
import { UploadDialog, type UploadedFile } from "./components/UploadDialog";
import { WorkspaceMetrics } from "./components/WorkspaceMetrics";
import { LoanList } from "./components/LoanList";
import { ProfileMenu } from "./components/ProfileMenu";
import { EmbeddedSign } from "./components/EmbeddedSign";
import { fetchIdentity, type LosIdentity } from "./lib/identity";
import type { BoxFolderItem } from "./lib/box";
import { formatLoanAmount, type LosLoanSummary } from "./lib/loans";
import { getLosPageContext } from "./lib/box";
import { COLLECTING_STATUSES } from "./lib/requiredDocuments";
import { useLoans } from "./lib/useLoans";

/**
 * This app is the borrower's surface, and only theirs.
 *
 * It carries no agent. The Copilot that used to sit beside this content ran as its own
 * agent user rather than as the person signed in, and took the loan it answered about
 * from the conversation -- so the one control on the page that could be asked anything was
 * the one control none of the scoping reached. Everything a borrower would ask it
 * ("is the commitment signed", "what terms did we agree", "what do you need from me") is
 * already on the page, and everything it could reach that they cannot -- the credit memo,
 * the credit policy library, the bank's exception positions -- is the reason not to put it
 * here.
 *
 * It used to serve both sides, which is why it carried an underwriting review queue and a
 * "copy agent context" button. The loan officer now works headlessly through the MCP
 * server, so everything here is what an external party may see: their own loans, the
 * application they are making, and the documents in them. Anything that reveals the
 * bank's own process does not belong.
 */
type View = "apply" | "loans" | "workspace";

/**
 * The query string a selected loan should produce.
 *
 * `folderId` is what the workspace needs and `recordId` is the fallback the endpoint
 * resolves from, so both are written when known; `loanId` is there to make the URL
 * readable. Selecting a loan has to change the URL, or the workspace cannot be linked
 * to, reloaded, or reached with the back button.
 */
function viewFromSearch(search = window.location.search): View {
  const params = new URLSearchParams(search);
  // An explicit marker wins: the list is reachable with a loan still named in the URL,
  // so returning to it does not throw away which loan was open.
  const marker = params.get("view");
  if (marker === "apply") return "apply";
  if (marker === "loans") return "loans";
  return params.has("recordId") || params.has("folderId") ? "workspace" : "loans";
}

/**
 * Whether the URL chose a view, or the app has to. A bare address is the one case where
 * the borrower is sent wherever makes sense for them -- the form when they have no loans,
 * the list when they do.
 */
function urlChoosesView(search = window.location.search): boolean {
  const params = new URLSearchParams(search);
  return params.has("view") || params.has("recordId") || params.has("folderId");
}

/** The same query the page already carries, with the view marker set or cleared. */
function searchForView(view: View): string {
  const params = new URLSearchParams(window.location.search);
  if (view === "workspace") params.delete("view");
  else params.set("view", view);
  const search = params.toString();
  return search ? `?${search}` : window.location.pathname;
}

function loanSearch(loan: LosLoanSummary): string {
  const params = new URLSearchParams();
  if (loan.loanId) params.set("loanId", loan.loanId);
  if (loan.recordId) params.set("recordId", loan.recordId);
  if (loan.boxFolderId) params.set("folderId", loan.boxFolderId);
  return params.toString();
}

const PAGE_TITLES: Record<View, string> = {
  apply: "Start an application",
  loans: "Your loans",
  workspace: "Loan workspace",
};

interface Notice {
  key: string;
  text: string;
  tone: "success" | "info" | "warning";
}

export function Workspace() {
  const [context, setContext] = useState(() => getLosPageContext());
  const [selected, setSelected] = useState<LosLoanSummary | null>(null);
  /**
   * Null until the folder has been listed. An empty array means the folder is genuinely
   * empty, and the history panel says something different for each.
   */
  const [files, setFiles] = useState<BoxFolderItem[] | null>(null);
  /** The live Box token and folder, once the workspace panel has minted them. */
  const [box, setBox] = useState<{ token: string; folderId: string } | null>(null);
  /** Set when Box cannot be read at all, so nothing derived from the listing is drawn. */
  const [boxError, setBoxError] = useState("");
  /** Who is signed in. Null until the answer arrives; nothing is drawn before then. */
  const [identity, setIdentity] = useState<LosIdentity | null>(null);
  /** True once the identity endpoint has answered, however it answered. */
  const [identitySettled, setIdentitySettled] = useState(false);
  const [uploading, setUploading] = useState(false);
  /** Bumped on upload close and after each classification so the listing catches up. */
  const [reloadKey, setReloadKey] = useState(0);
  /** What Box AI said about each upload, newest last. */
  const [notices, setNotices] = useState<Notice[]>([]);
  /** Embed URL for pending signature request */
  const [signEmbedUrl, setSignEmbedUrl] = useState<string | null>(null);
  /** File selected for preview from RequiredDocuments table */
  const [previewFile, setPreviewFile] = useState<BoxFolderItem | null>(null);
  const loans = useLoans();
  /**
   * A record in the URL means the page was opened with context -- a Lightning or
   * Experience page bound to one loan -- so it goes straight to that workspace.
   * Without one the app decides once identity and the loan list have both answered.
   */
  const [view, setView] = useState<View>(() => viewFromSearch());
  const [urlChosen, setUrlChosen] = useState(() => urlChoosesView());
  /** True once the entry decision has been made, so it is made exactly once. */
  const [decided, setDecided] = useState(false);

  /**
   * Keep the app in step with the address bar. Without this, Back after opening a
   * loan changes the URL and leaves the workspace on screen. The URL is the
   * authority here: going back re-reads it and drops the row selection, so the folder in
   * the URL is what the workspace opens.
   */
  useEffect(() => {
    function syncToUrl() {
      setContext(getLosPageContext());
      setSelected(null);
      setFiles(null);
      setBoxError("");
      setView(viewFromSearch());
      setUrlChosen(urlChoosesView());
    }
    window.addEventListener("popstate", syncToUrl);
    return () => window.removeEventListener("popstate", syncToUrl);
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      const who = await fetchIdentity();
      if (!active) return;
      if (who.ok) setIdentity(who.value);
      setIdentitySettled(true);
    })();
    return () => {
      active = false;
    };
  }, []);

  /**
   * Where a borrower lands when the URL did not say.
   *
   * A borrower with no loans has one thing to do here, so the form is the front door; one
   * with loans gets the list. Decided once, after both answers are in, and written to the
   * URL so a reload lands in the same place. Guests and unknown readers stay on the list,
   * where the sign-in prompt lives.
   */
  if (!decided && !urlChosen && identitySettled && !loans.loading) {
    // Decided during render rather than in an effect, so the list's empty state is never
    // painted for the frame before the form replaces it.
    setDecided(true);
    if (identity && !identity.isGuest && !loans.error && loans.loans.length === 0) {
      setView("apply");
    }
  }
  useEffect(() => {
    // The address bar follows the decision so a reload lands in the same place.
    if (decided && !urlChosen && view === "apply") {
      window.history.replaceState({}, "", searchForView("apply"));
    }
  }, [decided, urlChosen, view]);

  const openLoan = useCallback((loan: LosLoanSummary) => {
    const search = loanSearch(loan);
    setFiles(null);
    setBoxError("");
    setNotices([]);
    setPreviewFile(null);
    setSignEmbedUrl(loan.signEmbedUrl || null);
    window.history.pushState({}, "", search ? `?${search}` : window.location.pathname);
    setSelected(loan);
    setView("workspace");
    setUrlChosen(true);
  }, []);

  /**
   * Switching views is a navigation, so it goes through the address bar.
   *
   * Without this the view changed and the URL did not, so a reload re-read the loan
   * still named there and dropped the reader back into the workspace they had just left.
   * The loan stays in the query when the list or the form is shown, which is what lets
   * the Workspace item return to it rather than becoming a dead control.
   */
  const showView = useCallback((next: View) => {
    window.history.pushState({}, "", searchForView(next));
    setView(next);
    setPreviewFile(null);
    setUrlChosen(true);
  }, []);

  /** A new application: it joins the list, and its workspace opens. */
  const reloadLoans = loans.reload;
  const onCreated = useCallback((loan: LosLoanSummary) => {
    reloadLoans();
    openLoan(loan);
  }, [reloadLoans, openLoan]);

  /**
   * Which Box folder the workspace opens.
   *
   * The record id wins when there is one. The Box for Salesforce package owns the
   * record-to-folder association and provisions a folder for a record that has none, so
   * asking by record is both authoritative and self-healing; Box_Workspace_Folder_ID__c
   * is a denormalised copy that can fall behind it.
   *
   * A folder id is used only when there is no record to ask about -- a deep link or the
   * local harness -- and that path is still bounded by Allowed_Folder_Ids__c, because
   * there the caller chose the folder rather than a record.
   */
  const workspaceContext = useMemo(() => {
    if (selected?.recordId) {
      return { ...context, salesforceRecordId: selected.recordId };
    }
    return {
      ...context,
      ...(selected?.boxFolderId ? { folderId: selected.boxFolderId } : {}),
    };
  }, [context, selected]);

  /**
   * The loan the workspace is about. A row that was clicked, or -- when the page was
   * opened on a record -- the matching row from the reader's own list, so a reload or the
   * back button keeps the banner and the checklist. Never a fixture: with no matching row
   * the workspace has ids and nothing else, and says nothing it cannot back.
   */
  const current = useMemo(
    () => selected ?? loans.loans.find((loan) => loan.recordId === context.salesforceRecordId) ?? null,
    [selected, loans.loans, context.salesforceRecordId],
  );
  const collecting = Boolean(current?.status && COLLECTING_STATUSES.has(current.status));
  /** Whether the current user is a borrower (has an accountName) vs a bank user */
  const isBorrower = Boolean(identity?.accountName);

  /**
   * Handle uploaded files - Box Extract automatically classifies and applies metadata.
   *
   * Box Extract runs server-side on upload and applies the losDocument metadata template
   * with documentType, versionStatus, and other fields automatically extracted. No Apex
   * classification call needed.
   *
   * Since Box Extract jobs may take a few seconds to process, we reload the folder
   * immediately and again after a short delay to catch newly classified files.
   *
   * No notices shown - the upload dialog already confirms success, and the folder will
   * refresh automatically once Box Extract completes.
   */
  const handleUploaded = useCallback((uploaded: UploadedFile[]) => {
    if (uploaded.length === 0) return;

    // Reload immediately to show upload completed
    setReloadKey((n) => n + 1);

    // Reload again after Box Extract job has time to process (typically 2-5 seconds)
    // This catches newly classified files without showing intrusive notices
    setTimeout(() => {
      setReloadKey((n) => n + 1);
    }, 3000); // 3 second delay for Box Extract to process
  }, []);

  const navItem = (target: View, label: string, icon: ReactNode) => (
    <button
      type="button"
      className={view === target ? "nav-active" : ""}
      aria-current={view === target ? "page" : undefined}
      onClick={() => showView(target)}
    >
      {icon}
      <span>{label}</span>
    </button>
  );

  return (
    <div className="app-shell">
      {/*
        A rail, not a top bar of tabs. The brand and the three places a borrower can be
        sit down the left; the bar across the top says where they are and who they are.
      */}
      <aside className="cb-rail">
        <button type="button" className="brand" onClick={() => showView("apply")} aria-label="Return to home">
          <span className="brand-mark" aria-hidden="true">AB</span>
          <span className="brand-copy"><strong>Acme Bank</strong><small>Borrower Portal</small></span>
        </button>
        <nav aria-label="Primary">
          {navItem("apply", "Start an application", <FilePlus2 size={17} aria-hidden="true" />)}
          {navItem("loans", "Your loans", <FileStack size={17} aria-hidden="true" />)}
          {navItem("workspace", "Workspace", <LayoutDashboard size={17} aria-hidden="true" />)}
        </nav>
      </aside>

      <div className="cb-page">
        <header className="topbar">
          {/* Where the reader is, not which loan: the banner below names the loan, and
              two headings saying the same thing an inch apart is one too many. */}
          <h1 className="cb-page-title">{PAGE_TITLES[view]}</h1>
          <ProfileMenu identity={identity} />
        </header>

        {/*
          The banner describes the loan that is open, and only while it is open.

          The selection survives a trip to the list -- that is what lets the Workspace item
          return to it -- so the banner has to be gated on the view as well. Without that it
          headed the list of every loan with the name, amount and term of one of them.

          It used to fall back to a fixture whenever none was selected, so the list view was
          headed by another loan's name, amount and term -- and by "Approval blocked",
          which contradicted the status on the row directly beneath it. A header stating
          different facts from the list under it is worse than no header.

          The Salesforce record ID came out of the eyebrow at the same time. It is internal
          plumbing, and this page faces the borrower.
        */}
        {current && view === "workspace" ? (
          <div className="loan-banner">
            <div>
              <span className="eyebrow">{current.loanId}</span>
              <h2>{current.name}</h2>
              <p>{[current.borrower, current.loanType].filter(Boolean).join(" · ")}</p>
            </div>
            <div className="banner-metrics">
              <Metric label="Amount" value={formatLoanAmount(current.loanAmount)} />
              {current.termMonths != null ? (
                <Metric label="Term" value={`${current.termMonths} months`} />
              ) : null}
              {current.status ? <Metric label="Status" value={current.status} /> : null}
            </div>
          </div>
        ) : null}

        {view === "workspace" && !boxError && !previewFile ? (
          <div className="workspace-metrics-row">
            <WorkspaceMetrics files={files} />
          </div>
        ) : null}

        <div className={`content-grid${view === "workspace" && !boxError && !previewFile ? " content-grid-aside" : ""}`}>
          <main>
            {view === "apply" ? (
              <ApplicationForm identity={identity} onCreated={onCreated} />
            ) : view === "loans" ? (
              <LoanList
                loans={loans.loans}
                // Held on the skeleton until the entry decision is made, or the empty
                // state would flash before the form replaces it.
                loading={loans.loading || (!urlChosen && !decided)}
                error={loans.error}
                source={loans.source}
                onRetry={loans.reload}
                onSelect={openLoan}
                onStartApplication={() => showView("apply")}
                signInUrl={identity?.loginUrl}
                signedIn={identity ? !identity.isGuest : undefined}
              />
            ) : (
              <>
                {notices.length > 0 ? (
                  <ul className="cb-notices" aria-live="polite">
                    {notices.map((notice) => (
                      <li key={notice.key} className={`cb-notice cb-notice-${notice.tone}`} data-testid="classification-notice">
                        {notice.text}
                      </li>
                    ))}
                  </ul>
                ) : null}
                {signEmbedUrl ? (
                  <div className="signature-panel">
                    <h3>Signature Required</h3>
                    <p>Please review and sign the commitment letter below.</p>
                    <EmbeddedSign
                      embedUrl={signEmbedUrl}
                      onComplete={() => {
                        setSignEmbedUrl(null);
                        setNotices((was) => [
                          ...was,
                          {
                            key: 'sign-complete',
                            tone: 'success',
                            text: 'Document signed successfully.'
                          }
                        ]);
                        setReloadKey((n) => n + 1);
                      }}
                      onDecline={() => {
                        setSignEmbedUrl(null);
                        setNotices((was) => [
                          ...was,
                          {
                            key: 'sign-declined',
                            tone: 'info',
                            text: 'Signature request declined.'
                          }
                        ]);
                      }}
                      onError={(error) => {
                        setNotices((was) => [
                          ...was,
                          {
                            key: 'sign-error',
                            tone: 'warning',
                            text: `Signature error: ${error}`
                          }
                        ]);
                      }}
                    />
                  </div>
                ) : null}
                {isBorrower ? (
                  <>
                    {!previewFile && !boxError ? (
                      <RequiredDocuments
                        loanType={current?.loanType}
                        files={files}
                        canUpload={Boolean(box)}
                        onUpload={() => setUploading(true)}
                        onPreview={setPreviewFile}
                      />
                    ) : null}
                    {/* BoxWorkspace for borrowers - always mounted for data loading, but only shown for preview */}
                    <div className={previewFile ? undefined : "visually-hidden"}>
                      <BoxWorkspace
                        context={workspaceContext}
                        onFilesLoaded={setFiles}
                        onBoxReady={setBox}
                        reloadKey={reloadKey}
                        onUpload={() => setUploading(true)}
                        onFailed={setBoxError}
                        previewFile={previewFile}
                        onClosePreview={() => setPreviewFile(null)}
                      />
                    </div>
                  </>
                ) : (
                  <>
                    {!boxError ? (
                      <RequiredDocuments
                        loanType={current?.loanType}
                        files={files}
                        canUpload={Boolean(box)}
                        onUpload={() => setUploading(true)}
                        onPreview={setPreviewFile}
                      />
                    ) : null}
                    <BoxWorkspace
                      context={workspaceContext}
                      onFilesLoaded={setFiles}
                      onBoxReady={setBox}
                      reloadKey={reloadKey}
                      onUpload={() => setUploading(true)}
                      onFailed={setBoxError}
                      previewFile={previewFile}
                      onClosePreview={() => setPreviewFile(null)}
                    />
                  </>
                )}
              </>
            )}
          </main>
          {view === "workspace" && !boxError && !previewFile ? <DocumentTimeline files={files} /> : null}
        </div>
        {uploading && box ? (
          <UploadDialog
            folderId={box.folderId}
            tokenProvider={() => box.token}
            onUploaded={handleUploaded}
            onClose={() => {
              setUploading(false);
              setReloadKey((n) => n + 1);
            }}
          />
        ) : null}
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="metric"><span>{label}</span><strong>{value}</strong></div>;
}
