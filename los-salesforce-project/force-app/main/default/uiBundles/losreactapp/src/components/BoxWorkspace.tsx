import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { TableSkeleton, WorkspaceSkeleton } from "./WorkspaceSkeleton";
import { ExternalLink, Upload } from "lucide-react";
import { LOS_CONFIG } from "../config";
import { DataError } from "./DataError";
import { fetchDownscopedBoxToken, listBoxFolderItems, type BoxFolderItem, type LosPageContext } from "../lib/box";

/**
 * Loaded lazily to keep box-ui-elements out of the initial bundle. It is several
 * megabytes, and a workspace that fails to authorise never needs it, so the entry chunk
 * stays small for anyone who does not reach live Box content.
 */
const BoxElements = lazy(() =>
  import("./BoxElements").then((module) => ({ default: module.BoxElements })),
);

export function BoxWorkspace({
  context,
  onFilesLoaded,
  onBoxReady,
  reloadKey,
  onUpload,
  onFailed,
}: {
  context: LosPageContext;
  /**
   * Hands the loaded listing up so the timeline beside this panel is built from the same
   * array, already filtered. A second fetch could disagree with what the table shows.
   */
  onFilesLoaded?: (files: BoxFolderItem[]) => void;
  /**
   * Hands up the minted token and the folder it is bound to, so the workspace can offer
   * an upload without this panel owning the button. Null while there is no live Box.
   */
  onBoxReady?: (box: { token: string; folderId: string } | null) => void;
  /** Change this to re-list the folder -- after an upload, say. */
  reloadKey?: number;
  /** Opens the upload dialog, which the workspace owns. */
  onUpload?: () => void;
  /**
   * Raised when Box cannot be read at all. The workspace hides the panels built from the
   * listing rather than leaving them in a loading state that will never resolve.
   */
  onFailed?: (error: string) => void;
}) {
  const [token, setToken] = useState("");
  const [folderId, setFolderId] = useState("");
  const [files, setFiles] = useState<BoxFolderItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  /**
   * Held in a ref, not a dependency. The prop is optional, so a caller passing an inline
   * function would otherwise change identity every render and refetch the folder in a
   * loop.
   */
  const notifyFiles = useRef(onFilesLoaded);
  useEffect(() => {
    notifyFiles.current = onFilesLoaded;
  }, [onFilesLoaded]);
  const notifyBox = useRef(onBoxReady);
  useEffect(() => {
    notifyBox.current = onBoxReady;
  }, [onBoxReady]);
  const notifyFailed = useRef(onFailed);
  useEffect(() => {
    notifyFailed.current = onFailed;
  }, [onFailed]);
  const [error, setError] = useState("");
  /** Bumped by the retry button, so a transient failure does not need a page reload. */
  const [attempt, setAttempt] = useState(0);

  /**
   * Resolve the governed token, then probe the folder.
   *
   * The folder is an output, not an input: with a record id the endpoint reads the Box
   * for Salesforce association and tells us which folder it minted for. Everything below
   * uses that answer rather than anything the URL supplied.
   *
   * Either step can fail, and neither failure is papered over. The listing is also the
   * table the workspace renders, so the folder is read once rather than once per
   * component.
   */
  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      const fail = (reason: string) => {
        setError(reason);
        setFiles(null);
        setLoading(false);
        notifyFailed.current?.(reason);
        notifyBox.current?.(null);
      };

      const granted = await fetchDownscopedBoxToken(context);
      if (!active) return;
      if (!granted.ok) return fail(granted.error);

      setToken(granted.value.accessToken);
      setFolderId(granted.value.folderId);

      const listing = await listBoxFolderItems(granted.value.folderId, granted.value.accessToken);
      if (!active) return;
      if (!listing.ok) return fail(listing.error);

      setError("");
      setFiles(listing.value);
      notifyFiles.current?.(listing.value);
      // Withdraw an earlier failure as well as recording success. The workspace hides the
      // metrics and the history while this panel is failing, so a raised error that is
      // never lowered leaves them hidden over a workspace that has since loaded.
      notifyFailed.current?.("");
      notifyBox.current?.({
        token: granted.value.accessToken,
        folderId: granted.value.folderId,
      });
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [context, reloadKey, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  if (loading) {
    return <WorkspaceSkeleton />;
  }

  if (error) {
    return (
      <DataError
        title="This workspace could not be opened"
        detail={error}
        onRetry={retry}
        testId="box-error"
      />
    );
  }

  return (
    <section className="box-live" data-testid="box-preview">
      <div className="panel-head">
        <div>
          <h2>{LOS_CONFIG.workspace.name}</h2>
        </div>
        <div className="head-actions">
          {LOS_CONFIG.workspace.boxUrl ? (
            <a className="secondary-button" href={LOS_CONFIG.workspace.boxUrl} target="_blank" rel="noreferrer">
              Open in Box <ExternalLink size={15} />
            </a>
          ) : null}
          {onUpload ? (
            <button
              type="button"
              className="upload-button"
              onClick={onUpload}
              data-testid="box-upload-open"
            >
              <Upload size={15} /> Upload document
            </button>
          ) : null}
        </div>
      </div>
      <Suspense fallback={<TableSkeleton />}>
        <BoxElements folderId={folderId} token={token} files={files ?? []} />
      </Suspense>
    </section>
  );
}
