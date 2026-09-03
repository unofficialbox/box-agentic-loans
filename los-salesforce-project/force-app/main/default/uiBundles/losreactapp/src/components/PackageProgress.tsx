import { byDocumentStatus, documentTotals, formatDate } from "../lib/documents";
import type { BoxFolderItem } from "../lib/box";

/**
 * How far along the package is, as one bar read left to right.
 *
 * This was a second donut, and two rings side by side was the page's worst idea: identical
 * silhouettes, identical centre labels, distinguishable only by reading their titles. Type
 * is a composition and belongs in a ring. Status is a *progression* -- draft becomes
 * approved becomes executed -- and a progression is read along a line.
 *
 * Segments are ordered by that lifecycle rather than by size, so the bar fills rightward as
 * work lands rather than reshuffling when one count overtakes another. The colours are the
 * same ones the table's status pills use, so the bar and the rows beneath it are one
 * language instead of two.
 */
const LIFECYCLE = ["Draft", "Internal", "Approved", "Executed"];

function rank(label: string): number {
  const index = LIFECYCLE.indexOf(label);
  return index === -1 ? LIFECYCLE.length : index;
}

function slug(label: string): string {
  const known = LIFECYCLE.find((state) => state.toLowerCase() === label.toLowerCase());
  return known ? known.toLowerCase() : "none";
}

export function PackageProgress({ files }: { files: BoxFolderItem[] }) {
  const totals = documentTotals(files);
  const states = byDocumentStatus(files).sort(
    (a, b) => rank(a.label) - rank(b.label) || a.label.localeCompare(b.label),
  );

  return (
    <figure className="chart-figure package-progress">
      <figcaption className="chart-title">Review progress</figcaption>

      <p className="package-headline">
        <strong>{totals.approved}</strong> of {totals.documents} approved
      </p>

      <div
        className="progress-track"
        role="img"
        aria-label={states.map((state) => `${state.value} ${state.label}`).join(", ")}
      >
        {states.map((state) => (
          <span
            key={state.label}
            className={`progress-fill doc-status-${slug(state.label)}`}
            style={{ flexGrow: state.value }}
          >
            <title>{`${state.label}: ${state.value} of ${totals.documents}`}</title>
          </span>
        ))}
      </div>

      {/* Direct-labelled, in the same order as the bar, so identity is never colour alone. */}
      <ul className="progress-legend">
        {states.map((state) => (
          <li key={state.label}>
            <span className={`legend-swatch doc-status-${slug(state.label)}`} />
            <span className="legend-label">{state.label}</span>
            <span className="legend-value">{state.value}</span>
          </li>
        ))}
      </ul>

      <p className="package-caption">Last change {formatDate(totals.lastChangedAt)}</p>
    </figure>
  );
}
