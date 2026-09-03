import Preview from "box-content-preview";
import type { BoxFile, BoxToken, PreviewOptions } from "box-content-preview";
import "box-content-preview/styles.css";
// Vite emits the worker as its own asset and hands back a same-origin URL. pdf.js needs
// its worker as a separate file, so it is the one piece that cannot ride in the bundle.
import pdfWorkerUrl from "box-content-preview/pdf.worker.min.mjs?url";
import { sfdcEnv } from "./sfdcEnv";

/**
 * Where preview resolves its side-car assets (`exif/`, `cmaps/`, `third-party/`).
 *
 * Preview normally reads this off its own `<script src=".../preview.js">` tag. Bundled,
 * there is no tag, so the value comes out `undefined` and it requests
 * `undefinedexif/exif.min.js`. The trailing slash matters -- preview concatenates the
 * asset name onto this string rather than joining paths.
 *
 * Built from `basePath` rather than `document.baseURI`, which would resolve against
 * whatever route the workspace has pushed onto the URL.
 */
function staticBaseUri(): string {
  const base = (sfdcEnv()?.basePath ?? "").replace(/\/+$/, "");
  return `${globalThis.location.origin}${base}/assets/box-preview/`;
}

/**
 * Preview with the settings a bundled copy cannot infer for itself.
 *
 * Both have to be applied here rather than as ContentPreview props: `location` collides
 * with the prop react-router's `withRouter` injects into the annotations wrapper, which
 * overwrites ours before preview ever sees it.
 */
class BundledPreview extends Preview {
  show(fileOrId: string | BoxFile, token: BoxToken, options: PreviewOptions = {}): void {
    const base = staticBaseUri();
    super.show(fileOrId, token, {
      ...options,
      // staticBaseURI only, which is the package's declared npm-consumer hook. The
      // localized `baseURI` assets are bundled, so preview never resolves against it.
      location: { staticBaseURI: base, ...options.location },
      pdfjs: { workerSrc: pdfWorkerUrl, ...options.pdfjs },
    });
  }
}

/**
 * Box Content Preview, bundled instead of fetched.
 *
 * ContentPreview normally injects `<script src="cdn01.boxcdn.net/platform/preview/...">`
 * and waits for `global.Box.Preview` to appear. On an Experience Cloud site that script
 * never loads: the page sends `script-src 'self' ...` and Salesforce's CSP Trusted Sites
 * have no script-src directive to extend -- the org's own describe exposes only
 * connect/frame/img/style/font/media, which is why every other Box host in those trusted
 * sites reaches the header and this one cannot.
 *
 * So the library is an npm dependency and the bundler puts it on the page. Seeding
 * `global.Box` before ContentPreview mounts makes its `isPreviewLibraryLoaded()` true,
 * and `loadScript()` returns without touching the network.
 *
 * The assignment is unconditional. Importing the package already registers the plain
 * `Preview` on `global.Box` as a side effect, so a "only if missing" guard would leave
 * that one in place and quietly drop every setting `BundledPreview` exists to supply.
 */
export function installBoxPreview(): void {
  const target = globalThis as { Box?: Record<string, unknown> };
  target.Box = { ...target.Box, Preview: BundledPreview };
}
