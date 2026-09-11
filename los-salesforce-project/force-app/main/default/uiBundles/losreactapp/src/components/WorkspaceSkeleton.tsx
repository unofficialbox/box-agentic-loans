/**
 * The workspace while its token is being minted and its folder listed.
 *
 * A skeleton rather than a sentence, because the two say different things. "Connecting to
 * the governed Box workspace" describes the machinery to someone who did not ask about it,
 * and on a slow mint it is the only thing on screen for several seconds. A skeleton says
 * the same thing structurally -- something is coming, here is its shape -- and because it
 * is the shape of the real table, the layout does not jump when the content lands.
 *
 * Rows are fixed at six: enough to fill the panel, few enough not to imply a count. The
 * bars vary in width so it reads as content rather than a loading bar.
 */
const ROW_WIDTHS = ["72%", "58%", "80%", "64%", "76%", "52%"];

export function WorkspaceSkeleton({ showHeader = true }: { showHeader?: boolean }) {
  return (
    <div className="skeleton" data-testid="box-loading" aria-busy="true" aria-live="polite">
      <span className="visually-hidden">Loading the loan documents</span>

      {showHeader && <div className="skeleton-head" aria-hidden="true">
        <span className="skeleton-bar skeleton-bar-title" />
        <span className="skeleton-bar skeleton-bar-button" />
      </div>}

      <div className="skeleton-table" aria-hidden="true">
        {ROW_WIDTHS.map((width, index) => (
          <div className="skeleton-row" key={index}>
            <span className="skeleton-icon" />
            <span className="skeleton-bar" style={{ width }} />
            <span className="skeleton-bar skeleton-bar-meta" />
            <span className="skeleton-bar skeleton-bar-pill" />
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * The document history while the same listing is in flight.
 *
 * The panel's own heading stays real -- it is known before any data arrives, and
 * skeletoning a word we already have would be theatre. Only the entries are placeholders.
 *
 * Four of them, not six: the timeline's rows are taller than the table's, and four fills
 * the panel without implying the folder holds exactly that many.
 */
export function TimelineSkeleton() {
  return (
    <ol className="timeline skeleton-timeline" data-testid="timeline-loading" aria-busy="true">
      <li className="visually-hidden">Loading the document history</li>
      {[0, 1, 2, 3].map((row) => (
        <li className="timeline-item" key={row} aria-hidden="true">
          <span className="timeline-dot" />
          <div className="timeline-body">
            <span className="skeleton-bar skeleton-bar-date" />
            <span className="skeleton-bar skeleton-bar-name" />
            <span className="skeleton-bar skeleton-bar-meta" />
          </div>
        </li>
      ))}
    </ol>
  );
}

/**
 * The loan list while Salesforce is being asked what this organisation has borrowed.
 *
 * Same argument as the workspace's: "Loading loan records…" narrates the machinery
 * and leaves the page empty until it resolves. This one has more to hold still, because
 * the real view is two bands -- three figures, then the table -- and a single line of text
 * lets both land at once and shove the page around.
 *
 * The figures are drawn as their own shapes rather than as generic blocks: a ring for the
 * donut, stacked bars for the two bar charts. A skeleton that does not resemble what
 * replaces it is just a differently-shaped wait.
 */
const LOAN_ROW_WIDTHS = ["68%", "76%", "54%", "72%"];

export function LoansSkeleton() {
  return (
    <div className="loans-skeleton" data-testid="loans-loading" aria-busy="true" aria-live="polite">
      <span className="visually-hidden">Loading your loans</span>

      <div className="chart-row" aria-hidden="true">
        <figure className="chart-figure">
          <span className="skeleton-bar skeleton-bar-title" />
          <div className="skeleton-donut-row">
            <span className="skeleton-donut" />
            <div className="skeleton-legend">
              <span className="skeleton-bar skeleton-bar-meta" />
              <span className="skeleton-bar skeleton-bar-meta" />
            </div>
          </div>
        </figure>
        {[0, 1].map((chart) => (
          <figure className="chart-figure" key={chart}>
            <span className="skeleton-bar skeleton-bar-title" />
            <div className="skeleton-bars">
              {LOAN_ROW_WIDTHS.map((width, row) => (
                <div className="skeleton-bar-group" key={row}>
                  <span className="skeleton-bar skeleton-bar-label" />
                  <span className="skeleton-bar skeleton-bar-track" style={{ width }} />
                </div>
              ))}
            </div>
          </figure>
        ))}
      </div>

      <div className="skeleton skeleton-loans-table" aria-hidden="true">
        <div className="skeleton-table">
          {LOAN_ROW_WIDTHS.map((width, row) => (
            <div className="skeleton-row" key={row}>
              <span className="skeleton-icon" />
              <span className="skeleton-bar" style={{ width }} />
              <span className="skeleton-bar skeleton-bar-meta" />
              <span className="skeleton-bar skeleton-bar-pill" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * The document table while its lazy chunk downloads.
 *
 * box-ui-elements is several megabytes, so this fallback is on screen for a real moment on
 * a cold load. The panel's own header is already rendered above it, so this is rows only --
 * skeletoning a heading that is already on screen would make it flicker.
 */
export function TableSkeleton() {
  return (
    <div className="skeleton-table" data-testid="box-table-loading" aria-busy="true" aria-live="polite">
      <span className="visually-hidden">Loading the loan documents</span>
      {ROW_WIDTHS.map((width, index) => (
        <div className="skeleton-row" key={index} aria-hidden="true">
          <span className="skeleton-icon" />
          <span className="skeleton-bar" style={{ width }} />
          <span className="skeleton-bar skeleton-bar-meta" />
          <span className="skeleton-bar skeleton-bar-pill" />
        </div>
      ))}
    </div>
  );
}

/**
 * A document while the preview renderer downloads and paints.
 *
 * The shape is a page, because that is what arrives: one tall block with a couple of lines
 * of chrome above it. "Loading preview…" in the middle of an empty pane read as an error
 * on a slow connection.
 */
export function PreviewSkeleton() {
  return (
    <div className="skeleton-preview" data-testid="box-preview-loading" aria-busy="true" aria-live="polite">
      <span className="visually-hidden">Loading the document preview</span>
      <div className="skeleton-page" aria-hidden="true">
        <span className="skeleton-bar skeleton-bar-title" />
        {["92%", "88%", "95%", "72%", "90%", "84%", "58%"].map((width, index) => (
          <span className="skeleton-bar" key={index} style={{ width }} />
        ))}
      </div>
    </div>
  );
}

/** The uploader while its own chunk loads: the drop target, at the size it will be. */
export function UploaderSkeleton() {
  return (
    <div className="skeleton-uploader" data-testid="uploader-loading" aria-busy="true" aria-live="polite">
      <span className="visually-hidden">Loading the uploader</span>
      <span className="skeleton-dropzone" aria-hidden="true" />
      <span className="skeleton-bar skeleton-bar-title" aria-hidden="true" />
    </div>
  );
}
