import type { CheckStatus, ResultBlock } from "../transport";
import { StatusIcon, type StatusKind } from "./StatusIcon";

const STATUS_KIND: Record<CheckStatus, StatusKind> = {
  pass: "done",
  warn: "warning",
  fail: "failed",
  info: "pending",
};

const STATUS_TEXT: Record<CheckStatus, string> = {
  pass: "Passes",
  warn: "Needs attention",
  fail: "Fails",
  info: "For information",
};

/**
 * Structured results under a reply: label/value facts, checks with a verdict,
 * comparison tables, and linked documents. Status uses the page's one glyph
 * family, always with text beside it, so colour is never the only signal.
 */
export function ResultBlocks({ blocks }: { blocks: ResultBlock[] }) {
  if (blocks.length === 0) return null;
  return (
    <div className="blocks">
      {blocks.map((block, index) => (
        <section
          key={index}
          className={`block block-${block.type}`}
          aria-label={block.title}
          style={{ ["--i" as string]: index }}
        >
          {block.title && <h3 className="block-title">{block.title}</h3>}
          <Block block={block} />
        </section>
      ))}
    </div>
  );
}

function Block({ block }: { block: ResultBlock }) {
  switch (block.type) {
    case "facts":
      return (
        <dl className="facts">
          {block.rows.map(row => (
            <div key={row.label} className="fact">
              <dt>{row.label}</dt>
              <dd>{row.value}</dd>
            </div>
          ))}
        </dl>
      );
    case "checks":
      return (
        <ul className="checks">
          {block.rows.map(row => (
            <li key={row.label} className={`check check-${row.status}`}>
              <StatusIcon kind={STATUS_KIND[row.status]} />
              <span className="check-body">
                <span className="check-head">
                  <span className="check-label">{row.label}</span>
                  <span className="check-value">{row.value ?? STATUS_TEXT[row.status]}</span>
                </span>
                {row.detail && <span className="check-detail">{row.detail}</span>}
              </span>
            </li>
          ))}
        </ul>
      );
    case "table":
      return (
        <>
          {/* Wide tables scroll inside their frame, never the page. */}
          <div className="table-frame" tabIndex={0} role="region" aria-label={block.title ?? "Results table"}>
            <table className="result-table">
              <thead>
                <tr>
                  {block.columns.map(column => (
                    <th key={column} scope="col">
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {block.rows.map((row, index) => (
                  <tr key={index} className={row.status ? `row-${row.status}` : undefined}>
                    {row.cells.map((cell, i) =>
                      i === 0 ? (
                        <th key={i} scope="row">
                          <span className="row-head">
                            {row.status && <StatusIcon kind={STATUS_KIND[row.status]} />}
                            <span>
                              {cell}
                              {row.note && <span className="row-note">{row.note}</span>}
                              {row.status && !row.note && <span className="visually-hidden">, {STATUS_TEXT[row.status]}</span>}
                            </span>
                          </span>
                        </th>
                      ) : (
                        <td key={i}>{cell}</td>
                      )
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {block.footnote && <p className="block-footnote">{block.footnote}</p>}
        </>
      );
    case "documents":
      return (
        <ul className="documents">
          {block.items.map(item => {
            const content = (
              <>
                <FileIcon />
                <span className="document-text">
                  <span className="document-name">{item.name}</span>
                  {item.detail && <span className="document-detail">{item.detail}</span>}
                </span>
                {item.href && <span className="document-open" aria-hidden="true">↗</span>}
              </>
            );
            return (
              <li key={item.id}>
                {item.href ? (
                  <a className="document" href={item.href} target="_blank" rel="noreferrer">
                    {content}
                    <span className="visually-hidden"> (opens in Box)</span>
                  </a>
                ) : (
                  <span className="document">{content}</span>
                )}
              </li>
            );
          })}
        </ul>
      );
  }
}

function FileIcon() {
  return (
    <svg className="document-icon" viewBox="0 0 20 20" width="20" height="20" aria-hidden="true">
      <path d="M5.5 2.75h6l3.75 3.75v10a.75.75 0 0 1-.75.75h-9a.75.75 0 0 1-.75-.75V3.5a.75.75 0 0 1 .75-.75z" />
      <path d="M11.5 2.75V6.5h3.75" />
    </svg>
  );
}

/** Citation IDs already shown as documents, so the sources row doesn't repeat them. */
export function documentIds(blocks: ResultBlock[]): Set<string> {
  return new Set(blocks.flatMap(block => (block.type === "documents" ? block.items.map(item => item.id) : [])));
}
