import { cpSync, existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, normalize } from "node:path";
import type { Connect, Plugin } from "vite";

/**
 * Serves Box Content Preview's side-car assets from this app's own origin.
 *
 * The renderer is bundled from npm rather than fetched from the Box CDN, because an
 * Experience Cloud site sends `script-src 'self'` and Salesforce's CSP Trusted Sites have
 * no script-src directive to extend. Bundling solves the script, but preview still
 * resolves a few files at runtime against `options.location.staticBaseURI`, which it
 * normally derives from its own `<script>` tag. There is no such tag now, so the value is
 * `undefined` and preview requests `undefinedexif/exif.min.js`. The app passes an explicit
 * `staticBaseURI` (see `boxPreviewRuntime`) and this plugin puts the files there.
 *
 * Only `exif/` is copied. pdf.js itself is bundled into the npm build -- unlike the CDN
 * build, which loads it from `third-party/doc/` -- and the remaining side-cars are for
 * viewers this workspace does not use: `third-party/` is 20MB of Shaka players and 3D
 * model geometry, and `cmaps/` is 1.6MB of CJK encodings across ~330 files, which would
 * become ~330 more components on every UI bundle deploy.
 */
const ASSET_DIRS = ["exif"];
const MOUNT = "assets/box-preview";

function libDir(): string {
  const require = createRequire(import.meta.url);
  return join(dirname(require.resolve("box-content-preview/package.json")), "dist", "lib");
}

/**
 * Serves the copied tree straight out of node_modules while developing, so dev and a
 * built bundle resolve the same URLs. Hand-rolled rather than pulling in a static-file
 * dependency: it is one directory of scripts.
 */
function assetMiddleware(): Connect.NextHandleFunction {
  const lib = libDir();
  return (req, res, next) => {
    const path = (req.url || "").split("?")[0];
    const match = ASSET_DIRS.find((dir) => path.startsWith(`/${MOUNT}/${dir}/`));
    if (!match) return next();
    // normalize() collapses any `..` before the prefix check, so the served tree cannot
    // be escaped by a crafted request.
    const file = normalize(join(lib, path.slice(`/${MOUNT}/`.length)));
    if (!file.startsWith(lib) || !existsSync(file)) return next();
    res.setHeader("Content-Type", "application/javascript");
    res.end(readFileSync(file));
  };
}

export function boxPreviewAssets(): Plugin {
  return {
    name: "los-box-preview-assets",
    // Dev and `vite preview` serve straight out of node_modules; only a real build copies.
    configureServer(server) {
      server.middlewares.use(assetMiddleware());
    },
    configurePreviewServer(server) {
      server.middlewares.use(assetMiddleware());
    },
    closeBundle() {
      const lib = libDir();
      for (const dir of ASSET_DIRS) {
        const from = join(lib, dir);
        if (!existsSync(from)) continue;
        cpSync(from, join("dist", MOUNT, dir), { recursive: true });
      }
    },
  };
}
