import { lazy, Suspense, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { UploaderSkeleton } from "./WorkspaceSkeleton";
import { IntlProvider } from "react-intl";
import "box-ui-elements/dist/uploader.css";

/**
 * Several megabytes, and only needed when someone actually uploads, so it gets its own
 * chunk on the same reasoning as the preview.
 */
const ContentUploader = lazy(() =>
  import("box-ui-elements/es/elements/content-uploader").then((module) => ({
    default: module.default,
  })),
);

/**
 * Adding documents, over the table rather than instead of it.
 *
 * A full pane made the workspace forget what it was showing: the documents disappeared to
 * make room for the thing that adds one more. A dialog keeps the folder on screen behind
 * it, which is also the answer to "do I already have this file".
 *
 * Escape and the backdrop both close, because a dialog that can only be dismissed by
 * finding the right button is a dialog people get stuck in. Focus moves to the dialog on
 * open and returns to whatever opened it on close, so the keyboard is not stranded at the
 * top of the document afterwards.
 */
export interface UploadedFile {
  id: string;
  name: string;
}

export function UploadDialog({
  folderId,
  tokenProvider,
  onClose,
  onUploaded,
}: {
  folderId: string;
  tokenProvider: () => string;
  onClose: () => void;
  /**
   * The Box files a batch of uploads produced, once every one of them has finished.
   * Only the ids and names: the caller uses them to ask Salesforce to classify each file,
   * and everything else about the file is re-read from the folder listing.
   */
  onUploaded?: (files: UploadedFile[]) => void;
}) {
  const dialog = useRef<HTMLDivElement>(null);
  const opener = useRef<Element | null>(null);

  useEffect(() => {
    opener.current = document.activeElement;
    dialog.current?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      (opener.current as HTMLElement | null)?.focus?.();
    };
  }, [onClose]);

  /*
   * Portalled to the body rather than left where it is written.
   *
   * Not what fixed the layering -- that was a class-name collision with box-ui-elements,
   * see styles.css -- but the right parent regardless: an ancestor in the workspace layout
   * establishes a stacking context, and a dialog that has to escape one should not depend
   * on the page above it never growing another.
   */
  return createPortal(
    <div
      className="los-modal-backdrop"
      data-testid="upload-dialog"
      // The backdrop closes, but only when the backdrop itself is the thing clicked --
      // a click that started inside the dialog and drifted out must not dismiss it.
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="los-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="upload-dialog-title"
        tabIndex={-1}
        ref={dialog}
      >
        <div className="los-modal-head">
          <h2 id="upload-dialog-title">Add documents</h2>
          <button type="button" className="los-modal-close" onClick={onClose} aria-label="Close">
            <X size={17} />
          </button>
        </div>

        <div className="los-modal-body">
          {/*
            Same provider the preview needs: box-ui-elements reads from react-intl context
            and throws "Could not find required `intl` object" without one above it. The
            dialog renders outside BoxElements, so it cannot inherit that one.
          */}
          <IntlProvider locale="en" messages={{}}>
            <Suspense fallback={<UploaderSkeleton />}>
              <ContentUploader
                token={tokenProvider}
                rootFolderId={folderId}
                /* The token is downscoped to this one folder, so an upload cannot land
                   anywhere else even if the element were asked to. */
                onClose={onClose}
                onComplete={(files) => onUploaded?.(uploadedFiles(files))}
              />
            </Suspense>
          </IntlProvider>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/**
 * The element reports each item's Box file object; one that failed to upload has none.
 * Only files Box actually created are passed on -- classifying an id that does not exist
 * would fail at the endpoint and the failure would name a file the borrower never saw.
 */
function uploadedFiles(items: unknown[]): UploadedFile[] {
  return items.flatMap((item) => {
    const file = item as { id?: unknown; name?: unknown } | null | undefined;
    if (!file || typeof file.id !== "string" || !file.id) return [];
    return [{ id: file.id, name: typeof file.name === "string" ? file.name : file.id }];
  });
}
