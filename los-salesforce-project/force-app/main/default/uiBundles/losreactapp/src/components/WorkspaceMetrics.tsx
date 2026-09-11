import type { BoxFolderItem } from "../lib/box";
import { byDocumentType, isSigningDocument } from "../lib/documents";
import { Donut, foldToPalette } from "./Donut";
import { PackageProgress } from "./PackageProgress";

/**
 * The loan package at a glance, above its documents.
 *
 * It used to be four stat tiles and two donuts. The tiles stated documents, approved and
 * open; the status donut then stated the same three numbers again in a different visual
 * language a few inches away, which teaches a reader that the summary is padding. Each
 * number is stated once now.
 *
 * Two figures, deliberately different shapes: a ring for what the package is made of, a bar
 * for how far along it is. Both sit inside `.viz`, which owns the --series-N variables the
 * donut draws from.
 */
export function WorkspaceMetrics({ files }: { files: BoxFolderItem[] | null }) {
  if (files === null) {
    return (
      <section className="workspace-metrics" data-testid="workspace-metrics-loading">
        <div className="progress-card">
          <div className="progress-head">
            <span className="skeleton-bar" style={{ width: "140px", height: "13px" }} />
            <span className="skeleton-bar" style={{ width: "80px", height: "13px" }} />
          </div>
          <div style={{ padding: "16px 0" }}>
            <div className="skeleton-bar" style={{ width: "100%", height: "12px", borderRadius: "6px" }} />
          </div>
          <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
            <span className="skeleton-bar" style={{ width: "80px", height: "11px" }} />
            <span className="skeleton-bar" style={{ width: "100px", height: "11px" }} />
            <span className="skeleton-bar" style={{ width: "90px", height: "11px" }} />
          </div>
        </div>
        <div className="donut-card">
          <h3 className="donut-title">
            <span className="skeleton-bar" style={{ width: "140px", height: "13px" }} />
          </h3>
          <div style={{ display: "flex", justifyContent: "center", padding: "20px 0" }}>
            <div style={{ width: "140px", height: "140px", borderRadius: "50%", background: "var(--ab-sand-tint)" }} className="skeleton-bar" />
          </div>
        </div>
      </section>
    );
  }

  if (files.filter((file) => !isSigningDocument(file)).length === 0) return null;

  const types = foldToPalette(byDocumentType(files));

  return (
    <section className="workspace-metrics viz" data-testid="workspace-metrics">
      <PackageProgress files={files} />
      <Donut slices={types} centreLabel="documents" title="Documents by type" />
    </section>
  );
}
