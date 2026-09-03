import type { BoxFolderItem } from "../lib/box";
import { byDocumentType } from "../lib/documents";
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
  if (files === null || files.length === 0) return null;

  const types = foldToPalette(byDocumentType(files));

  return (
    <section className="workspace-metrics viz" data-testid="workspace-metrics">
      <PackageProgress files={files} />
      <Donut slices={types} centreLabel="documents" title="Documents by type" />
    </section>
  );
}
