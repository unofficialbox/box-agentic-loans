import { useLayoutEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";

/**
 * One field: the message box with its send button inside the frame. Enter
 * sends, Shift+Enter adds a line; while a reply streams, the button stops it.
 */
export function Composer({
  streaming,
  onSend,
  onStop,
  inputRef,
}: {
  streaming: boolean;
  onSend: (text: string) => void;
  onStop: () => void;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
}) {
  const [text, setText] = useState("");
  const composing = useRef(false);
  const canSend = text.trim().length > 0 && !streaming;

  // Grow with the text, up to the CSS max-height.
  useLayoutEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.style.height = "auto";
    input.style.height = `${input.scrollHeight}px`;
  }, [text, inputRef]);

  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    if (!canSend) return;
    onSend(text);
    setText("");
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey && !composing.current && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submit();
    }
  };

  return (
    <form className="composer" onSubmit={submit}>
      <label className="visually-hidden" htmlFor="composer-input">
        Message the Loan Copilot
      </label>
      <textarea
        id="composer-input"
        ref={inputRef}
        className="composer-input"
        rows={1}
        value={text}
        placeholder="Ask about documents, terms, policy, or history…"
        onChange={event => setText(event.target.value)}
        onKeyDown={onKeyDown}
        onCompositionStart={() => (composing.current = true)}
        onCompositionEnd={() => (composing.current = false)}
      />
      {streaming ? (
        <button type="button" className="composer-button composer-stop" onClick={onStop} aria-label="Stop the reply">
          <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
            <rect x="4" y="4" width="8" height="8" rx="1.5" fill="currentColor" />
          </svg>
        </button>
      ) : (
        <button type="submit" className="composer-button composer-send" disabled={!canSend} aria-label="Send">
          <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
            <path d="M8 13V3M3.75 7.25L8 3l4.25 4.25" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      )}
    </form>
  );
}
