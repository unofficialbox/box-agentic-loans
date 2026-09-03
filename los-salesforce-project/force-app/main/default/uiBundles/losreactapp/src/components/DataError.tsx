import { AlertTriangle, LogIn, RefreshCw } from "lucide-react";

/**
 * What the page shows when a remote read fails.
 *
 * It names the thing that could not be loaded and quotes the reason verbatim, because the
 * reason is the only part that shortens the debugging. This replaced synthetic fixtures,
 * which rendered a workspace that looked live and was not -- the failure reached nobody,
 * and a demo could be given against an org that never answered.
 */
export function DataError({
  title,
  detail,
  onRetry,
  signInUrl,
  testId,
}: {
  title: string;
  detail: string;
  onRetry?: () => void;
  /** Rendered only when the environment supplies one; the path is site-specific. */
  signInUrl?: string;
  testId: string;
}) {
  return (
    <section className="data-error" role="alert" data-testid={testId}>
      <span className="data-error-icon"><AlertTriangle size={19} aria-hidden="true" /></span>
      <div className="data-error-copy">
        <h2>{title}</h2>
        <p>{detail}</p>
      </div>
      {signInUrl ? (
        <a className="upload-button" href={signInUrl} data-testid="data-error-signin">
          <LogIn size={15} aria-hidden="true" /> Sign in
        </a>
      ) : null}
      {onRetry ? (
        <button type="button" className="secondary-button" onClick={onRetry}>
          <RefreshCw size={15} aria-hidden="true" /> Try again
        </button>
      ) : null}
    </section>
  );
}
