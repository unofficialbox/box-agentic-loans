import { useCallback, useEffect, useMemo, useState } from "react";
import { FileStack, LayoutDashboard } from "lucide-react";
import { BoxWorkspace } from "./components/BoxWorkspace";
import { DocumentTimeline } from "./components/DocumentTimeline";
import { UploadDialog } from "./components/UploadDialog";
import { WorkspaceMetrics } from "./components/WorkspaceMetrics";
import { LoanList } from "./components/LoanList";
import { ProfileMenu } from "./components/ProfileMenu";
import { fetchIdentity, type LosIdentity } from "./lib/identity";
import type { BoxFolderItem } from "./lib/box";
import { formatLoanAmount, type LosLoanSummary } from "./lib/loans";
import { getLosPageContext } from "./lib/box";

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
 * server, so everything here is what an external party may see: their own loans and the
 * documents in them. Anything that reveals the bank's own process does not belong.
 */
type View = "loans" | "workspace";

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
  if (params.get("view") === "loans") return "loans";
  return params.has("recordId") || params.has("folderId") ? "workspace" : "loans";
}

/** The same query the page already carries, with the view marker set or cleared. */
function searchForView(view: View): string {
  const params = new URLSearchParams(window.location.search);
  if (view === "loans") params.set("view", "loans");
  else params.delete("view");
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
  const [uploading, setUploading] = useState(false);
  /** Bumped on upload close so the folder is listed again and the new file appears. */
  const [reloadKey, setReloadKey] = useState(0);
  /**
   * A record in the URL means the page was opened with context -- a Lightning or
   * Experience page bound to one loan -- so it goes straight to that workspace.
   * Without one there is nothing to show yet, and the dashboard is the entry point.
   */
  const [view, setView] = useState<View>(() => viewFromSearch());

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
    }
    window.addEventListener("popstate", syncToUrl);
    return () => window.removeEventListener("popstate", syncToUrl);
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      const who = await fetchIdentity();
      if (active && who.ok) setIdentity(who.value);
    })();
    return () => {
      active = false;
    };
  }, []);

  const openLoan = useCallback((loan: LosLoanSummary) => {
    const search = loanSearch(loan);
    setFiles(null);
    setBoxError("");
    window.history.pushState({}, "", search ? `?${search}` : window.location.pathname);
    setSelected(loan);
    setView("workspace");
  }, []);

  /**
   * Switching tabs is a navigation, so it goes through the address bar.
   *
   * Without this the view changed and the URL did not, so a reload re-read the loan
   * still named there and dropped the reader back into the workspace they had just left.
   * The loan stays in the query when the list is shown, which is what lets the
   * Workspace tab return to it rather than becoming a dead control.
   */
  const showView = useCallback((next: View) => {
    window.history.pushState({}, "", searchForView(next));
    setView(next);
  }, []);

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


  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand"><span className="brand-mark">C</span><span><strong>Crestline Borrower Portal</strong><small>Loan origination powered by Box and Headless 360</small></span></div>
        <nav aria-label="Primary">
          <button className={view === "loans" ? "nav-active" : ""} onClick={() => showView("loans")}><FileStack size={16} /> Your loans</button>
          <button className={view === "workspace" ? "nav-active" : ""} onClick={() => showView("workspace")}><LayoutDashboard size={16} /> Workspace</button>
        </nav>
        <ProfileMenu identity={identity} />
      </header>

      {/*
        The banner describes the loan that is open, and only while it is open.

        The selection survives a trip to the list -- that is what lets the Workspace tab
        return to it -- so the banner has to be gated on the view as well. Without that it
        headed the list of every loan with the name, amount and term of one of them.

        It used to fall back to a fixture whenever none was selected, so the list view was
        headed by another loan's name, amount and term -- and by "Approval blocked",
        which contradicted the status on the row directly beneath it. A header stating
        different facts from the list under it is worse than no header.

        The Salesforce record ID came out of the eyebrow at the same time. It is internal
        plumbing, and this page faces the borrower.
      */}
      {selected && view === "workspace" ? (
        <div className="loan-banner">
          <div>
            <span className="eyebrow">{selected.loanId}</span>
            <h1>{selected.name}</h1>
            <p>{[selected.borrower, selected.loanType].filter(Boolean).join(" · ")}</p>
          </div>
          <div className="banner-metrics">
            <Metric label="Amount" value={formatLoanAmount(selected.loanAmount)} />
            {selected.termMonths != null ? (
              <Metric label="Term" value={`${selected.termMonths} months`} />
            ) : null}
            {selected.status ? <Metric label="Status" value={selected.status} /> : null}
          </div>
        </div>
      ) : null}

      {view === "workspace" && !boxError ? (
        <div className="workspace-metrics-row">
          <WorkspaceMetrics files={files} />
        </div>
      ) : null}

      <div className={`content-grid${view === "workspace" && !boxError ? " content-grid-aside" : ""}`}>
        <main>
          {view === "loans" ? (
            <LoanList onSelect={openLoan} signInUrl={identity?.loginUrl} />
          ) : (
            <BoxWorkspace
              context={workspaceContext}
              onFilesLoaded={setFiles}
              onBoxReady={setBox}
              reloadKey={reloadKey}
              onUpload={() => setUploading(true)}
              onFailed={setBoxError}
            />
          )}
        </main>
        {view === "workspace" && !boxError ? <DocumentTimeline files={files} /> : null}
      </div>
      {uploading && box ? (
        <UploadDialog
          folderId={box.folderId}
          tokenProvider={() => box.token}
          onClose={() => {
            setUploading(false);
            setReloadKey((n) => n + 1);
          }}
        />
      ) : null}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="metric"><span>{label}</span><strong>{value}</strong></div>;
}
