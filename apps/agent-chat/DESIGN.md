# Loan Copilot design guidelines

The rules the Loan Copilot is built to, and the reasons for them. Use them for any change to this app, and as the starting point for any other agent UI on Box Open Elements. Each rule names where it is implemented, so the guideline and the code stay together.

References we took from and still check against:
- Apple's Human Interface Guidelines: clarity, deference, consistency.
- Linear's 2025 interface refresh: calmer, less colour, colour for meaning.
- Vercel Geist: a single accent colour.
- The agent products people already know: Claude, ChatGPT, Codex and Perplexity. From them: steps collapsed behind "Worked for…", conversations on the left, outputs and sources on the right, approval before any write.

## 1. Principles

1. **The answer is the content; chrome defers to it.** Replies sit on the page as text, not in bubbles or cards. Everything around them is quieter than they are.
2. **Colour means something.**
   - Blue is the one accent: the primary action, links and the mark.
   - Amber means waiting on you or needs attention.
   - Green means done or within bounds.
   - Red means failed or out of bounds.
   - Nothing is coloured just to decorate.
3. **One of each.** One button system, one status glyph family, one type scale, one set of motion tokens. A second variant needs a reason.
4. **Structure over prose.** Results render as tables, verdict rows and label/value lists, never as `•` bullets or ✓/✗ characters in text.
5. **Honest state.**
   - Say what is happening, and how long it took.
   - Approving an action and the action succeeding are two separate facts.
   - A partial or failed result says so.
6. **Governed by default.** Nothing that writes runs without an approval the officer can see. Nothing competes with an approval that is waiting.
7. **The work is one click away, not always on screen.** Plans, steps and timings are available on request, and collapsed by default.
8. **Developer tooling is never in the product UI.** It lives on its own page.

## 2. Anti-patterns: the tells of generated UI

Reviewers have called these out as signs a UI was assembled by an AI. Don't use them:

- **A coloured accent bar down one edge of a rounded card** (`border-left: 3px solid …`). Show state with an icon, text and the card's own frame. Once an approval is decided it collapses to a line of record (`ApprovalCard.tsx`).
- **Sparkle marks and pink-to-blue gradients** as the brand. The mark is Acme Bank's own arch (`BrandMark.tsx`).
- **ASCII formatting in replies:** `•`, `✓`, `✗`, `←`, `!`. The agent sends structure (`block` events) and the client renders it. A test fails if replies contain these characters (`apps/loan-agent/test/engine.test.ts`).
- **A centred 2×2 grid of prompt cards** as the empty state. The welcome is left-aligned on the conversation's edge, with the ways in as a list of rows.
- **Card soup:** every element boxed. Only two kinds of card exist: a waiting approval, and a document row that opens in Box.
- **Uppercase eyebrow labels everywhere.** Use sentence case. Uppercase is kept only for the small block titles over result tables ("TERMS", "CREDIT POLICY").
- **Pills for everything.** Metadata such as loan ID and status is quiet text separated by `·`, not boxed pills.
- **Restyling a third-party component from the outside.** We replaced `<box-agent-chat>` and its adopted shadow stylesheet with our own rendering on the headless `AgentChatController`.
- **Dev tools in the product.** The API console is `devtools.html`, not a shelf under the chat.

## 3. Foundations

All tokens are in `src/styles/base.css`, layered over the Box tokens applied to `<html>`. `src/theme.ts` switches light and dark with the OS setting.

### Colour roles

| Token | Use |
|---|---|
| `--brand` | The one accent: the primary button, links, the mark, the focus ring's hue |
| `--surface`, `--surface-hover` | The page, and hover and quiet fills |
| `--sidebar-surface` | Sidebars, one step back from the conversation |
| `--selected` | A brand-tinted selection, e.g. the selected API call |
| `--selected-quiet` | A neutral selection, e.g. the current chat. Not a brand tint. |
| `--stroke` | Every hairline and border |
| `--text`, `--muted` | Two text levels only |
| `--success`, `--warning`, `--danger` | Status only, always paired with words or a glyph |
| `--focus` | One focus ring: a 3px brand halo, applied with `:focus-visible` |

Never hard-code a colour per theme. Mix with `color-mix(in srgb, var(--danger) 80%, var(--text))` so status text stays legible in both themes.

### Type

- **Lato** (Box Blueprint) for everything people read and use: 14px body on a 20px line, and 15px/1.6 for reply text.
- **Source Serif 4** carries the bank's voice in two places only: the wordmark and the greeting.
- **Monospace** only for wire data (headers and bodies in the API console).
- `font-variant-numeric: tabular-nums` wherever numbers line up: amounts, IDs, timings, table cells.
- Reading measure: `--measure: 44rem`, about 75 characters. The thread column and the composer share it.

### Space, radius, elevation

- Spacing follows the 4px scale: `--space-1` to `--space-8`.
- Radii: `--radius-1` to `--radius-4`, plus `--radius-pill`.
- Two shadows: `--dropshadow-1` for resting and `--dropshadow-3` for raised (the composer, a waiting approval, drawers). Nothing else casts a shadow.

### Controls

- One button system: pill-shaped, 13px semibold, 32px (`--control-height`) or 28px (`--control-height-compact`).
- Variants:
  - default (hairline)
  - `button-primary` (the one filled button in view)
  - `button-quiet` (no frame until hover)
  - `icon-button`
- The button that was pressed stays solid while its work runs (`aria-busy`, with a spinner); its sibling dims.

### Status glyph family

`StatusIcon.tsx`: one 16px circle for every status on the page.

| Kind | Glyph |
|---|---|
| pending | hollow ring |
| active | ring with a turning arc |
| done | green disc with a check |
| warning | amber disc with a bar |
| failed | red disc with a cross |
| skipped | dashed ring |

Every glyph has text beside it or a visually hidden label (`statusLabel`), so colour is never the only signal. Result rows map `pass`, `warn`, `fail` and `info` onto the same family.

### Motion

Motion tokens are in `base.css`: `--duration-1` 120ms, `--duration-2` 200ms, `--duration-3` 320ms, `--ease-out`, and `--stagger` 50ms.
- **Quick, eased out, never bouncy.** Motion marks something arriving or changing state, never decoration.
- **Arrivals rise into place** (`rise`: 6px and fade): the welcome in reading order, messages, result blocks staggered by index, the approval card, and new API calls.
- **State changes settle:** a status disc pops in and a check strokes on.
- **Disclosures animate real height** with a grid row going from `0fr` to `1fr`: no measuring, and `inert` while closed.
- **Reduced motion:** one global rule under `prefers-reduced-motion`. Everything settles at once and spinners and shimmers hold still.

## 4. Layout

- **Three panes, like Claude and ChatGPT** (`LoanCopilot.tsx`):
  - **Chats (left):** this tab's conversations. Each row says "Working…" or "Needs your approval".
  - **Conversation (centre).**
  - **Details (right):** about the conversation, not the turn. It shows the loan, the approvals (click one to jump to its card) and every source cited.
- **Wide windows:** panes sit beside the chat, animate their width (their content keeps a fixed width, so nothing reflows) and remember whether you closed them. The details panel starts open at 1200px and wider.
- **Under 900px:** both panes are drawers with a scrim, closed until asked for. Escape or a tap outside closes them, and they are `inert` while closed.
- **Nothing duplicates across panes.** With the details panel open, the inline Sources row under replies hides.
- **Every conversation stays mounted while hidden.** A turn keeps running, and the scroll position is kept, when you switch chats. Per-conversation DOM ids are scoped (`proposalAnchor`, `useId` in the composer).
- **Use `overflow: clip`, not `hidden`, on layout containers.** `scrollIntoView` can scroll an `overflow: hidden` box and shift the whole layout.

## 5. The conversation

### Anatomy of a reply

1. **Progress line** (`TurnProgress.tsx`):
   - While working, it names the step in flight in the plan's own words: "Extract terms with Box AI…". The label shimmers gently.
   - Past 2 seconds it adds a counting clock ("… 4 s") so a slow call never looks stalled.
   - When done it reads "Worked for 2.4 s ›", "Stopped after…" or "Cut short after…".
   - Opening it shows the plan, then every step (routing, tool calls, approval holds) with its timing.
2. **One or two sentences** that state the finding, e.g. "Of 4 policy checks, 2 within policy, 1 needs an exception and 1 is outside policy." Counts are pluralised correctly.
3. **Result blocks** (`ResultBlocks.tsx`), from the agent's `block` events:
   - `facts`: label/value pairs on hairlines.
   - `checks`: glyph, rule, verdict in words, and the reason under it.
   - `table`: real `<table>` markup with a row status and a note ("Departs from precedent"). The subject column is last and strongest. It scrolls inside its own frame and never scrolls the page.
   - `documents`: one row per file; the whole row opens it in Box.
4. **Sources:** quiet tags, collapsed after three. A file already shown as a document isn't repeated.
5. **Approval card**, if the turn proposes a write (below).
6. **Next steps:** chips after the latest reply only, and none while an approval waits.

The officer's own messages are soft bubbles on the right. The agent's replies are plain text, with no avatar and no bubble.

### Approvals

`ApprovalCard.tsx`:
- **Waiting:** the only card in the thread. It has a hairline frame and no accent edge, a sentence-case "Needs your approval" with a status glyph, the parameters as a facts list, and Approve as the only filled button. It also says how to change the proposal: "reply with the new values".
- **Decided:** it steps back to one line of record, like a permission result, with the note under it:
  - "✓ Approved · Apply 3 terms to …"
  - "Rejected · …"
- **Approved but the action failed** (`outcome: "failed"`):
  - It reads "Approved · didn't complete" in red with the reason as the note. It is never a green "Approved".
  - The next step offered is **Try again** (the same request), not steps that assume the action worked.
  - The details panel shows the same state.

### Composer

`Composer.tsx`:
- It is one field: the send button sits inside the frame.
- Enter sends and Shift+Enter adds a line. It is guarded for IME composition.
- It grows with the text up to a maximum.
- While a reply streams, Send becomes Stop.
- It focuses when a chat comes into view.

### Scrolling

- **Follow new content** to the bottom only while the officer hasn't scrolled up.
- **Read intent from what they do:** wheel, touch, keys, dragging the scrollbar. Scroll events alone don't count, because resizes fire them too.
- **A new message always re-pins** to the bottom.
- **Scrolled up while a reply grows?** A **Jump to latest** button appears over the composer.

### Empty state

- A greeting by time of day, in the serif: "Good evening. Which loan are we working on?"
- One line on what the copilot does.
- The ways in as a list of rows with arrows, on the same left edge as the conversation that replaces them.

## 6. Waiting, loading and failure

- **Each wait has its own form:** the progress line and clock for a turn, a caret where streamed text is arriving, a spinner in the pressed button, and skeleton rows shaped like the content that will replace them (the API console).
- **An incomplete stream is detected, not guessed.**
  - Every event carries `seq`, and a turn ends with `done`.
  - A gap, or a stream that ends early, reads "This reply may be incomplete".
- **A 200 can still be a failure.** An MCP response with a JSON-RPC `error`, or a tool result with `isError: true`, is a failed call. The log marks it "tool error" and counts it under Errors.
- **Expected non-2xx answers are labelled as expected,** not as failures. An example is the 405 the MCP spec allows for an event-stream GET.

## 7. Accessibility

- **Landmarks:** `nav` for Chats, `aside` for Details, `main` for the conversation, and one `h1` for the current loan or chat.
- **Focus:** a visible `:focus-visible` ring on every control. Closed panels and closed disclosures are `inert`, and drawers close on Escape.
- **Live regions:** the step in flight is announced (`role="status"`). A failed action uses `role="alert"`. The per-second clock is not announced.
- **Words beside colour:** every status has words next to its colour, and every icon-only control has a label.
- **Numbers and tables:** numbers use tabular figures, and tables use `th scope`.
- **Reduced motion** is honoured globally (see Motion).
- **Checked at:** 1440px and 390px, light and dark, keyboard only.

## 8. The agent contract serves the design

The UI can only be honest if the agent tells it enough. The loan agent's `/chat` stream (`apps/loan-agent/src/contract.ts`) carries:
- `delta` for text and `block` for structure;
- `citation` and `proposal`;
- `trace` steps (same id → update) and `todos` (full snapshots);
- `context` for the loan, `options` for next steps, and `done`;
- `seq` on every event.

`/actions/resolve` returns `decision` plus `outcome`. Replies are short on purpose: the client renders the structure.

## 9. Before you ship a UI change

- `npm test` and `npm run build` in `apps/agent-chat`, and `npm test` in `apps/loan-agent`.
- Walk the clickpath in a browser: risk search, extract and check, validate, apply (approve), compare, letter (approve), signature. Test live against the fixtures agent and in demo mode.
- Check 1440px and 390px, light and dark, and keyboard-only. Check that nothing overflows horizontally and the console shows no errors.
- Re-read the anti-patterns in §2 against your screenshots.
