/**
 * A donut, drawn as stroked arcs on one circle.
 *
 * Shared by the portfolio and the loan package so the two read as one chart type
 * rather than two that happen to be round. Colours come from `--series-N`, which the
 * `.viz` scope defines; nothing here hard-codes a hue.
 *
 * Every segment is direct-labelled with its count in the legend beside it. That is not
 * decoration: the light palette's third hue sits under 3:1 against white, and the
 * validator's contrast warning is discharged by labels rather than waved away.
 */
export interface DonutSlice {
  label: string;
  value: number;
}

/** Beyond this the palette would have to grow past its validated set, so the tail folds. */
const MAX_SLICES = 3;

export function foldToPalette(slices: DonutSlice[]): DonutSlice[] {
  if (slices.length <= MAX_SLICES) return slices;
  const head = slices.slice(0, MAX_SLICES - 1);
  const rest = slices.slice(MAX_SLICES - 1);
  return [...head, { label: "Other", value: rest.reduce((sum, s) => sum + s.value, 0) }];
}

export function Donut({
  slices,
  centreLabel,
  title,
}: {
  slices: DonutSlice[];
  centreLabel: string;
  title: string;
}) {
  const total = slices.reduce((sum, s) => sum + s.value, 0);
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const gap = 2;

  // Folded rather than accumulated into an outer variable: mutating during render is what
  // makes a component disagree with itself between renders.
  const arcs = slices.reduce<
    Array<DonutSlice & { index: number; dash: number; offset: number; length: number }>
  >((acc, slice, index) => {
    const previous = acc[acc.length - 1];
    const offset = previous ? previous.offset + previous.length : 0;
    const length = total === 0 ? 0 : (slice.value / total) * circumference;
    return [...acc, { ...slice, index, length, offset, dash: Math.max(length - gap, 0) }];
  }, []);

  return (
    <figure className="chart-figure">
      <figcaption className="chart-title">{title}</figcaption>
      <div className="donut-row">
        <svg
          viewBox="0 0 140 140"
          className="donut"
          role="img"
          aria-label={`${title}, ${total} in total`}
        >
          <g transform="translate(70,70) rotate(-90)">
            {arcs.map((arc) => (
              <circle
                key={arc.label}
                r={radius}
                fill="none"
                stroke={`var(--series-${arc.index + 1})`}
                strokeWidth="16"
                strokeDasharray={`${arc.dash} ${circumference - arc.dash}`}
                strokeDashoffset={-arc.offset}
              >
                <title>{`${arc.label}: ${arc.value} of ${total}`}</title>
              </circle>
            ))}
          </g>
          <text x="70" y="66" className="donut-total">{total}</text>
          <text x="70" y="84" className="donut-total-label">{centreLabel}</text>
        </svg>

        {/* Legend and direct labels in one: identity is never colour alone. */}
        <ul className="legend">
          {slices.map((slice, index) => (
            <li key={slice.label}>
              <span className="legend-swatch" style={{ background: `var(--series-${index + 1})` }} />
              <span className="legend-label">{slice.label}</span>
              <span className="legend-value">{slice.value}</span>
            </li>
          ))}
        </ul>
      </div>
    </figure>
  );
}
