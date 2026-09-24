/**
 * The Loan Copilot's treatment of <box-agent-chat>, adopted into the element's
 * shadow root. Parts alone cannot tell a user message from an agent one, or
 * Approve from Reject, so the rules key on the element's own data attributes
 * (data-role, data-action, data-decision). Tokens come from .copilot and
 * inherit into the shadow tree, so this follows light and dark mode.
 *
 * Direction: the conversation is the content and the chrome defers to it.
 * Agent replies are plain text on the page, the officer's messages are soft
 * bubbles, and the one thing that asks for attention is an action awaiting
 * approval.
 */
const CSS = /* css */ `
  [part="panel"] {
    gap: 0;
    padding: 0;
  }

  /* The status line ("Thinking…") only; the title is visually hidden by the page. */
  [part="header"] {
    min-height: 0;
    padding: var(--space-3) var(--space-6) 0;
  }

  [part="status"] {
    font-size: 0.75rem;
  }

  [part="thread"] {
    gap: var(--space-6);
    padding: var(--space-5) var(--space-6) var(--space-6);
    scroll-padding-bottom: var(--space-6);
  }

  [part="message"] {
    gap: var(--space-2);
    padding: 0;
    border: 0;
    border-radius: 0;
    background: transparent;
    animation: message-in 0.18s ease-out;
  }

  /* The officer: a soft bubble on the right, no header. */
  [part="message"][data-role="user"] {
    justify-self: end;
    max-width: min(36rem, 85%);
    margin: 0;
    padding: var(--space-3) var(--space-4);
    border-radius: 1.25rem 1.25rem 0.375rem 1.25rem;
    background: var(--surface-hover);
  }

  [part="message"][data-role="user"] [part="message-header"] {
    display: none;
  }

  [part="message"][data-status="error"] [part="body"] {
    color: var(--danger);
  }

  [part="message-header"] {
    gap: var(--space-2);
  }

  /* The agent's mark: the Box AI gradient, like the product mark in the top bar. */
  [part="avatar"] {
    width: 1.5rem;
    height: 1.5rem;
    border: 0;
    background: var(--box-ai);
    color: #fff;
    font-size: 0.625rem;
    font-weight: 700;
  }

  [part="author"] {
    font-size: 0.8125rem;
    font-weight: 600;
  }

  [part="body"] {
    margin: 0;
    font-size: 0.9375rem;
    line-height: 1.6;
  }

  [part="citations"] {
    align-items: flex-start;
    gap: var(--space-2);
    margin-top: var(--space-1);
  }

  /* Compact pill; a long label wraps inside it rather than spilling out. */
  [part="citation"] {
    box-sizing: border-box;
    min-height: var(--control-height-compact);
    max-width: 100%;
    padding: 0.3125rem var(--space-3);
    text-align: start;
    white-space: normal;
    overflow-wrap: anywhere;
    border: 1px solid var(--stroke);
    border-radius: var(--radius-pill);
    background: var(--surface);
    color: var(--brand);
    font-size: var(--control-font-size);
    font-weight: var(--control-font-weight);
    line-height: 1.25;
  }

  [part="citation"]:hover {
    background: var(--surface-hover);
  }

  /* An action awaiting approval: the only card in the thread. */
  [part="proposal"] {
    gap: var(--space-2);
    margin-top: var(--space-2);
    padding: var(--space-4) var(--space-5);
    border: 1px solid var(--stroke);
    border-left: 3px solid var(--warning);
    border-radius: var(--radius-4);
    background: var(--surface);
    box-shadow: var(--dropshadow-3);
  }

  [part="proposal"]::before {
    content: "Needs your approval";
    color: color-mix(in srgb, var(--warning) 55%, var(--text));
    font-size: 0.6875rem;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  /* Decided: back to a quiet record; the edge and eyebrow say how it went. */
  [part="proposal"][data-decision] {
    background: var(--surface);
    box-shadow: none;
  }

  [part="proposal"][data-decision="approved"] {
    border-left-color: var(--success);
  }

  [part="proposal"][data-decision="approved"]::before {
    content: "Approved";
    color: color-mix(in srgb, var(--success) 70%, var(--text));
  }

  [part="proposal"][data-decision="rejected"] {
    border-left-color: var(--stroke);
  }

  [part="proposal"][data-decision="rejected"]::before {
    content: "Rejected";
    color: var(--muted);
  }

  /* The eyebrow above says it; the pill would repeat it. */
  [part="decision"] {
    display: none;
  }

  [part="proposal-title"] {
    font-size: 0.9375rem;
    font-weight: 600;
  }

  [part="proposal-summary"],
  [part="proposal-note"] {
    margin: 0;
    color: var(--muted);
    font-size: 0.8125rem;
  }

  [part="proposal-params"] {
    grid-template-columns: max-content 1fr;
    gap: var(--space-1) var(--space-5);
    margin: var(--space-1) 0;
    font-size: 0.8125rem;
  }

  [part="param-label"] {
    color: var(--muted);
  }

  [part="param-value"] {
    font-variant-numeric: tabular-nums;
  }

  [part="proposal-actions"] {
    gap: var(--space-2);
    margin-top: var(--space-2);
  }

  /* Approve is the primary action; Reject is secondary; Modify is quiet. */
  [part="proposal-action"] {
    height: var(--control-height-compact);
    padding: 0 var(--space-4);
    border: 1px solid var(--stroke);
    background: var(--surface);
    color: var(--text);
    font-size: var(--control-font-size);
    font-weight: var(--control-font-weight);
  }

  [part="proposal-action"]:hover {
    background: var(--surface-hover);
  }

  [part="proposal-action"][data-action="approve"] {
    border-color: transparent;
    background: var(--brand);
    color: #fff;
  }

  [part="proposal-action"][data-action="approve"]:hover {
    background: color-mix(in srgb, var(--brand) 85%, #000);
  }

  [part="proposal-action"][data-action="modify"] {
    border-color: transparent;
    background: transparent;
    color: var(--muted);
  }

  [part="proposal-action"]:focus-visible,
  [part="citation"]:focus-visible,
  [part="send"]:focus-visible,
  [part="stop"]:focus-visible {
    outline: none;
    box-shadow: var(--focus);
  }

  /* The composer reads as one field: the input and its send button in one frame. */
  [part="composer"] {
    grid-template-columns: 1fr auto;
    align-items: end;
    gap: var(--space-2);
    margin: 0 var(--space-5) var(--space-5);
    padding: var(--space-2) var(--space-2) var(--space-2) var(--space-4);
    border: 1px solid var(--stroke);
    border-radius: var(--radius-4);
    background: var(--surface);
    box-shadow: var(--dropshadow-1);
    transition: border-color 0.15s ease, box-shadow 0.15s ease;
  }

  [part="composer"]:focus-within {
    border-color: color-mix(in srgb, var(--brand) 55%, var(--stroke));
    box-shadow: var(--focus);
  }

  [part="input"] {
    min-height: 2.5rem;
    max-height: 12rem;
    padding: var(--space-2) 0;
    border: 0;
    border-radius: 0;
    background: transparent;
    font-size: 0.9375rem;
    line-height: 1.5;
    resize: none;
    box-shadow: none;
  }

  [part="input"]:focus,
  [part="input"]:focus-visible {
    outline: none;
    box-shadow: none;
  }

  [part="composer-actions"] {
    align-self: end;
  }

  [part="send"],
  [part="stop"] {
    border-color: transparent;
    background: var(--brand);
    color: #fff;
  }

  [part="stop"] {
    background: var(--surface-hover);
    color: var(--text);
  }

  [part="send"]:disabled {
    opacity: 0.35;
    cursor: default;
  }

  @keyframes message-in {
    from {
      opacity: 0;
      transform: translateY(4px);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    [part="message"] {
      animation: none;
    }
  }

  @media (max-width: 56rem) {
    [part="header"] {
      padding: var(--space-2) var(--space-4) 0;
    }

    [part="thread"] {
      padding: var(--space-4);
    }

    [part="composer"] {
      margin: 0 var(--space-3) var(--space-3);
    }
  }
`;

let sheet: CSSStyleSheet | undefined;

/** Adopts the theme into the chat's shadow root once; safe to call again. */
export function applyChatTheme(host: HTMLElement): void {
  const root = host.shadowRoot;
  if (!root || typeof CSSStyleSheet === "undefined" || !("adoptedStyleSheets" in root)) return;
  sheet ??= (() => {
    const created = new CSSStyleSheet();
    created.replaceSync(CSS);
    return created;
  })();
  if (!root.adoptedStyleSheets.includes(sheet)) {
    root.adoptedStyleSheets = [...root.adoptedStyleSheets, sheet];
  }
}
