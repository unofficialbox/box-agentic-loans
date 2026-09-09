import { useEffect, useRef, useState } from "react";

export interface EmbeddedSignProps {
  /** The Box Sign embed URL from the sign request */
  embedUrl: string;
  /** Called when signing is complete */
  onComplete?: () => void;
  /** Called when signing is declined */
  onDecline?: () => void;
  /** Called when signing errors */
  onError?: (error: string) => void;
}

/**
 * Embedded Box Sign iframe component.
 *
 * Displays a Box Sign request in an iframe for in-app signing.
 * Follows: https://developer.box.com/guides/box-sign/embedded-sign-client.md
 */
export function EmbeddedSign({ embedUrl, onComplete, onDecline, onError }: EmbeddedSignProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Listen for postMessage events from the Box Sign iframe
    const handleMessage = (event: MessageEvent) => {
      // Verify origin is from Box
      if (!event.origin.includes('box.com')) {
        return;
      }

      const data = event.data;

      // Box Sign sends events with a 'type' field
      if (data && typeof data === 'object' && 'type' in data) {
        switch (data.type) {
          case 'sign_completed':
            onComplete?.();
            break;
          case 'sign_declined':
            onDecline?.();
            break;
          case 'sign_error':
            onError?.(data.message || 'An error occurred during signing');
            break;
        }
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [onComplete, onDecline, onError]);

  return (
    <div className="embedded-sign-container">
      {loading && (
        <div className="embedded-sign-loading">
          <div className="spinner" />
          <p>Loading signature request...</p>
        </div>
      )}
      <iframe
        ref={iframeRef}
        src={embedUrl}
        className="embedded-sign-iframe"
        title="Box Sign Document"
        onLoad={() => setLoading(false)}
        allow="clipboard-write"
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
      />
    </div>
  );
}
