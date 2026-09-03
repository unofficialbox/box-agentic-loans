import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import BoxAnnotations from "box-annotations";
import { IntlProvider } from "react-intl";
import { MemoryRouter } from "react-router-dom";
import "box-ui-elements/dist/preview.css";
import type { BoxFolderItem } from "../lib/box";
import { installBoxPreview } from "../lib/boxPreviewRuntime";
import { BoxDocumentTable } from "./BoxDocumentTable";
import { PreviewSkeleton } from "./WorkspaceSkeleton";

// Before ContentPreview mounts, so it finds the library already there and never reaches
// for the CDN script the site's CSP blocks.
installBoxPreview();

/**
 * Several megabytes on its own, and only needed once a document is opened, so it stays
 * behind its own chunk.
 */
const ContentPreview = lazy(() =>
  import("box-ui-elements/es/elements/content-preview").then((module) => ({
    default: module.default,
  })),
);

/**
 * ContentPreview expects a BoxAnnotations instance and does not build one itself.
 * Constructed once at module scope: it is stateful, and a per-render instance would
 * drop the annotator between previews.
 */
const boxAnnotations = new BoxAnnotations({});

/**
 * Only the stylesheet, not the library.
 *
 * The renderer itself is bundled from npm (see `boxPreviewRuntime`) at 3.85.0, so
 * `loadScript` never runs. `loadStylesheet` has no such guard and always appends a
 * `<link>` at this version, and style-src does allow the Box CDN -- but the CDN's newest
 * published release is 3.83.0 (3.84.0 and 3.85.0 both 404 there, even though npm ships
 * them and the package README documents those URLs). Pinning to what the CDN actually
 * serves keeps that link from 404ing; the matching 3.85.0 stylesheet is bundled too, so
 * preview is still styled if the CDN is unreachable.
 */
const PREVIEW_STYLESHEET_VERSION = "3.83.0";

/** How long to wait for the renderer before saying so rather than showing a blank frame. */
const PREVIEW_LOAD_TIMEOUT_MS = 15000;

/**
 * Whether Box Content Preview actually reached the page.
 *
 * ContentPreview waits for `global.Box.Preview` forever and renders an empty frame if it
 * never appears, reporting nothing. `installBoxPreview` seeds it from the bundle, so this
 * should not fire -- but a silent blank panel is the one failure mode this component has
 * already produced three different ways, and it is worth naming rather than staring at.
 */
function usePreviewLibrary(): "loading" | "ready" | "blocked" {
  const [state, setState] = useState<"loading" | "ready" | "blocked">("loading");

  useEffect(() => {
    const previewGlobal = () =>
      (globalThis as { Box?: { Preview?: unknown } }).Box?.Preview !== undefined;
    // Polled rather than checked once up front: the script may already be cached from an
    // earlier preview, and the poll covers that case on its first tick.
    const poll = setInterval(() => {
      if (previewGlobal()) {
        setState("ready");
        clearInterval(poll);
      }
    }, 250);
    const giveUp = setTimeout(() => {
      clearInterval(poll);
      setState((current) => (current === "ready" ? current : "blocked"));
    }, PREVIEW_LOAD_TIMEOUT_MS);
    return () => {
      clearInterval(poll);
      clearTimeout(giveUp);
    };
  }, []);

  return state;
}

/**
 * The Box workspace: the folder's documents, and the one being read.
 *
 * Content Explorer is deliberately not used here. It renders in its small/touch layout in
 * this embedding whatever the container width, and its ItemList only opens a file when
 * `!isTouch`, so a click on a file never reached preview. Listing the folder ourselves and
 * mounting ContentPreview directly is the pattern the qualitypilot workspace uses, and it
 * puts the file activation in our hands.
 *
 * The token bounds all of it: it is downscoped to this one folder.
 */
export function BoxElements({
  folderId,
  token,
  files,
}: {
  folderId: string;
  token: string;
  files: BoxFolderItem[];
}) {
  const [selected, setSelected] = useState<BoxFolderItem | null>(null);

  /**
   * Preview gets the token as a function, not the string.
   *
   * ContentPreview forwards whatever it is given straight through as `annotatorToken`,
   * and Box Content Preview 3.x rejects anything that is not a function --
   * `if (annotatorToken !== undefined && typeof annotatorToken !== "function") throw new
   * Error("Bad annotatorToken!")`. That throw aborts the whole viewer, so a string token
   * renders an empty frame with no visible error. Memoized so preview is not torn down
   * and re-initialized on every render.
   */
  const tokenProvider = useCallback(() => token, [token]);
  const library = usePreviewLibrary();

  if (!token || !folderId) {
    return null;
  }

  return (
    // box-ui-elements reads from react-intl context and throws "Could not find required
    // `intl` object" without a provider above it.
    <IntlProvider locale="en" messages={{}}>
      <section className="box-elements" data-testid="box-elements">
        {selected ? (
          <div className="box-preview-pane" data-testid="box-preview-pane">
            <div className="box-preview-bar">
              <button type="button" className="secondary-button" onClick={() => setSelected(null)}>
                <ArrowLeft size={15} /> All documents
              </button>
              <span className="box-preview-name">{selected.name}</span>
            </div>
            <div className="box-element-host">
              {library === "blocked" ? (
                <div className="workspace-state" data-testid="box-preview-blocked">
                  Box Content Preview did not initialize. The renderer is bundled with
                  {" "}this app, so this is not the CDN or the page CSP — check the console.
                </div>
              ) : null}
              <Suspense fallback={<PreviewSkeleton />}>
                {/*
                  The annotations layer is wrapped in react-router's withRouter and throws
                  "You should not use <withRouter(WithAnnotations(Component))/> outside a
                  <Router>" without routing context above it. box-ui-elements supplies one
                  only when a sidebar is mounted, which this view does not use, so the
                  preview provides its own. Memory history, not browser history: the
                  workspace owns the URL and preview must not push to it.
                */}
                <MemoryRouter>
                  <ContentPreview
                    token={tokenProvider}
                    fileId={selected.id}
                    boxAnnotations={boxAnnotations}
                    previewLibraryVersion={PREVIEW_STYLESHEET_VERSION}
                    hasHeader={false}
                  />
                </MemoryRouter>
              </Suspense>
            </div>
          </div>
        ) : (
          <div className="box-table-host">
            <BoxDocumentTable files={files} onSelect={setSelected} />
          </div>
        )}
      </section>
    </IntlProvider>
  );
}
