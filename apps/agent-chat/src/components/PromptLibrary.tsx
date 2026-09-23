import { useEffect, useRef, useState } from "react";
import { CATEGORY_ORDER, PROMPT_LIBRARY, type PromptCategory } from "../prompts";

interface Props {
  open: boolean;
  onClose: () => void;
  onPick: (prompt: string) => void;
}

/**
 * Box AI's prompt library, scoped to lending: category tabs over prompt cards
 * carrying Box's department and industry tags. A native <dialog> gives focus
 * trapping, Esc to close, and a backdrop for free.
 */
export function PromptLibrary({ open, onClose, onPick }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [category, setCategory] = useState<PromptCategory>(CATEGORY_ORDER[0]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const prompts = PROMPT_LIBRARY.filter(prompt => prompt.category === category);

  return (
    <dialog
      ref={dialogRef}
      className="library"
      aria-labelledby="library-title"
      onClose={onClose}
      onClick={event => {
        // A click on the backdrop lands on the dialog element itself.
        if (event.target === dialogRef.current) onClose();
      }}
    >
      <div className="library-panel">
        <header className="library-header">
          <div>
            <h2 className="library-title" id="library-title">
              Prompt library
            </h2>
            <p className="library-scope">
              <span className="pill">Finance</span>
              <span className="pill">Financial services</span>
            </p>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close prompt library">
            ×
          </button>
        </header>

        <div
          className="library-tabs"
          role="tablist"
          aria-label="Prompt categories"
          onKeyDown={event => {
            // Arrow keys move between tabs, per the ARIA tabs pattern.
            const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
            if (!step) return;
            event.preventDefault();
            const next = CATEGORY_ORDER[(CATEGORY_ORDER.indexOf(category) + step + CATEGORY_ORDER.length) % CATEGORY_ORDER.length];
            setCategory(next);
            document.getElementById(`tab-${next}`)?.focus();
          }}
        >
          {CATEGORY_ORDER.map(name => (
            <button
              key={name}
              type="button"
              role="tab"
              id={`tab-${name}`}
              aria-selected={category === name}
              tabIndex={category === name ? 0 : -1}
              aria-controls="library-list"
              className="library-tab"
              onClick={() => setCategory(name)}
            >
              {name}
              <span className="library-tab-count">
                {PROMPT_LIBRARY.filter(prompt => prompt.category === name).length}
              </span>
            </button>
          ))}
        </div>

        <ul className="library-list" id="library-list" role="tabpanel" aria-labelledby={`tab-${category}`}>
          {prompts.map(prompt => (
            <li key={prompt.id}>
              <button type="button" className="library-card" onClick={() => onPick(prompt.content)}>
                <span className="library-card-title">{prompt.title}</span>
                <span className="library-card-description">{prompt.description}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </dialog>
  );
}
