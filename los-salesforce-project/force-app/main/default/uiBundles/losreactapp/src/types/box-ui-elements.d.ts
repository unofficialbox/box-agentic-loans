/**
 * box-ui-elements ships Flow types, not TypeScript, so `tsc -b` cannot resolve these
 * modules on its own. Declare only the props this app actually passes; a wider surface
 * would be guesswork against an untyped package.
 */
declare module "box-ui-elements/es/elements/content-preview" {
  import type { ComponentType } from "react";

  export interface ContentPreviewProps {
    /**
     * A function, not a string: it is forwarded as `annotatorToken`, and Box Content
     * Preview 3.x throws "Bad annotatorToken!" on anything else.
     */
    token: (fileId?: string) => string | Promise<string>;
    fileId: string;
    /** ContentPreview expects an instance; it does not construct one. */
    boxAnnotations?: unknown;
    /** Box Content Preview release to load; the element otherwise defaults to 3.0.0. */
    previewLibraryVersion?: string;
    /** Origin the preview library is fetched from. Defaults to the Box CDN. */
    staticHost?: string;
    /** Path under staticHost, before `<version>/<locale>/preview.js`. */
    staticPath?: string;
    hasHeader?: boolean;
    showAnnotations?: boolean;
    contentSidebarProps?: Record<string, unknown>;
    onError?: (error: unknown) => void;
    language?: string;
  }

  const ContentPreview: ComponentType<ContentPreviewProps>;
  export default ContentPreview;
}

declare module "box-ui-elements/es/elements/content-uploader" {
  import type { ComponentType } from "react";

  export interface ContentUploaderProps {
    /** Same rule as ContentPreview: a provider, not a string. */
    token: (fileId?: string) => string | Promise<string>;
    /** Where uploads land. The downscoped token bounds this to one folder regardless. */
    rootFolderId: string;
    onClose?: () => void;
    onComplete?: (files: unknown[]) => void;
    onUpload?: (file: unknown) => void;
    onError?: (error: unknown) => void;
    isFolderUploadEnabled?: boolean;
    language?: string;
  }

  const ContentUploader: ComponentType<ContentUploaderProps>;
  export default ContentUploader;
}

declare module "box-ui-elements/dist/preview.css";

/** box-annotations ships no types; the app only ever constructs it. */
declare module "box-annotations" {
  export default class BoxAnnotations {
    constructor(options?: Record<string, unknown>);
  }
}
