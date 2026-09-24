/**
 * Acme Bank's mark: an arch on a plinth, a bank's doorway rather than an AI
 * sparkle. Drawn on the brand blue so it holds in light and dark.
 */
export function BrandMark({ size = 28 }: { size?: number }) {
  return (
    <svg className="brand-mark" viewBox="0 0 28 28" width={size} height={size} aria-hidden="true">
      <rect width="28" height="28" rx="7" className="brand-mark-tile" />
      <path d="M9 20.5v-7a5 5 0 0 1 10 0v7" className="brand-mark-line" />
      <path d="M6.5 20.5h15" className="brand-mark-line" />
    </svg>
  );
}
