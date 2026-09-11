import { useEffect, useRef, useState } from "react";
import { apexFetch } from "../lib/apexRest";

export interface EmbeddedSignProps {
  background?: boolean;
  embedUrl: string;
  recordId: string;
  onComplete?: (showConfirmation: boolean) => void;
  onDecline?: () => void;
  onError?: (error: string) => void;
}

/** Box status is authoritative; cross-origin iframe messages cannot prove a signature. */
export function EmbeddedSign({ background = false, embedUrl, recordId, onComplete, onDecline, onError }: EmbeddedSignProps) {
  const [loading, setLoading] = useState(true);
  const [checked, setChecked] = useState(false);
  const [statusError, setStatusError] = useState(false);
  const callbacks = useRef({ onComplete, onDecline, onError });
  useEffect(() => { callbacks.current = { onComplete, onDecline, onError }; }, [onComplete, onDecline, onError]);

  useEffect(() => {
    let disposed = false;
    let frameOpened = false;
    let timer: ReturnType<typeof setTimeout>;
    const controller = new AbortController();
    async function check() {
      try {
        const response = await apexFetch(`/services/apexrest/los/sign-status?recordId=${encodeURIComponent(recordId)}`, {
          method: "POST", headers: { Accept: "application/json" }, signal: controller.signal,
        });
        if (!response.ok) throw new Error("Status unavailable");
        const { status } = await response.json() as { status?: string };
        if (!status) throw new Error("Status unavailable");
        if (disposed) return;
        setStatusError(false);
        if (status === "signed") { callbacks.current.onComplete?.(frameOpened); return; }
        if (status === "declined") { callbacks.current.onDecline?.(); return; }
        if (["cancelled", "expired", "none"].includes(status)) {
          callbacks.current.onError?.("This signing request is no longer active. Return to documents and refresh the loan.");
          return;
        }
        frameOpened = !background;
        setChecked(true);
      } catch {
        if (disposed) return;
        setStatusError(true);
      }
      if (!disposed) timer = setTimeout(check, 5000);
    }
    void check();
    return () => { disposed = true; controller.abort(); clearTimeout(timer); };
  }, [embedUrl, recordId, background]);

  if (background) return null;

  return (
    <div className="embedded-sign-container">
      {statusError && <p role="status">Unable to check signing status. Retrying automatically.</p>}
      {(loading || !checked) && !statusError && <div className="embedded-sign-loading"><div className="spinner" /><p>Loading signature request...</p></div>}
      {checked && <iframe src={embedUrl} className="embedded-sign-iframe" title="Box Sign Document"
        onLoad={() => setLoading(false)} allow="clipboard-write"
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups" />}
    </div>
  );
}
