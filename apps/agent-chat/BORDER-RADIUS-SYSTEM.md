# Border Radius System

Consistent border-radius tokens applied throughout the interface for visual harmony and clear component hierarchy.

## Token System

```css
--radius-sm: 6px;     /* Small elements, tight corners */
--radius-md: 8px;     /* Standard buttons, controls */
--radius-lg: 12px;    /* Cards, inputs (friendly) */
--radius-pill: 999px; /* Pills, tags, badges */
--radius-circle: 50%; /* Icon-only buttons */
```

## Usage Map

### Small (6px) - Tight Corners
**Use for:** Small interactive elements that need subtle rounding
- History sidebar close button
- Nested controls within larger components

**Why 6px?** Minimal rounding that softens corners without being prominent. Good for small touch targets.

### Medium (8px) - Standard Buttons
**Use for:** Action buttons, controls, standard interactive elements
- `.history-btn` - History toggle button
- `.icon-btn` - Header icon buttons (share, more)
- `.new-btn` - Primary "New" button
- `.control-btn` - Input bar control buttons (sources, agent selector)
- `.pro-toggle` - Pro mode toggle container
- `.nav-item` - Sidebar navigation items

**Why 8px?** The Goldilocks radius - friendly but not too rounded. Perfect for buttons that need to feel clickable without being playful. Box's standard button radius.

**Examples:**
```css
<button class="history-btn">History</button>
<button class="icon-btn">...</button>
<button class="new-btn">New</button>
```

### Large (12px) - Cards & Inputs
**Use for:** Cards, inputs, containers that need a friendly, approachable feel
- `.document-card` - Document preview cards
- `.input-wrapper` - Main chat input container
- `.history-item` - History session cards

**Why 12px?** More rounded = more friendly and approachable. Perfect for larger surfaces that need to feel inviting. Makes inputs feel comfortable to interact with.

**Examples:**
```css
<div class="document-card">...</div>
<div class="input-wrapper">...</div>
<button class="history-item">...</button>
```

### Pill (999px) - Tags & Tabs
**Use for:** Pills, tabs, tags, badges - elements that should feel like capsules
- `.tab` - Empty state prompt category tabs
- `.toggle-slider` - Pro toggle slider track

**Why 999px?** Creates perfect pill shape regardless of content width. The track always has fully rounded ends.

**Examples:**
```css
<button class="tab">Recent sessions</button>
<button class="tab active">Summarize</button>
```

### Circle (50%) - Icon Buttons
**Use for:** Icon-only buttons, circular controls
- `.send-btn` - Primary send button
- `.toggle-slider::after` - Pro toggle thumb

**Why 50%?** Creates perfect circles for icon-only buttons. Universal pattern for "this is just an icon, no text."

**Examples:**
```css
<button class="send-btn">
  <svg>...</svg>
</button>
```

## Visual Hierarchy

```
More Rounded (Friendlier)
↑
12px - Cards, inputs, friendly surfaces
8px  - Standard buttons, controls
6px  - Small elements, subtle rounding
↓
Less Rounded (Tighter)

Special Cases:
999px - Pills (full rounding on ends)
50%   - Circles (icons only)
```

## Component Categories

### Navigation & Structure
```
Sidebar nav items:   8px (--radius-md)
Active accent bars:  3px (fixed, not tokenized)
```

### Buttons & Controls
```
Action buttons:      8px (--radius-md)
Icon buttons:       50% (--radius-circle)
Close buttons:       6px (--radius-sm)
Pills/tabs:        999px (--radius-pill)
```

### Cards & Surfaces
```
Document cards:     12px (--radius-lg)
History items:      12px (--radius-lg)
```

### Inputs & Forms
```
Input wrapper:      12px (--radius-lg)
Toggle track:      999px (--radius-pill)
Toggle thumb:       50% (--radius-circle)
Control badges:      8px (--radius-md)
```

## Design Rationale

### Why This Scale?

**6px, 8px, 12px** form a 2:3:6 ratio:
- Small jumps between values (clear but not jarring)
- Each step has clear purpose
- Easy to remember and apply

**999px** creates perfect pills without needing to match height
- Works at any size
- Self-documenting intent (pill shape)

**50%** creates perfect circles
- Universal pattern
- No math needed

### Consistency Benefits

1. **Visual Harmony** - Related elements share radius values
2. **Clear Hierarchy** - Larger = friendlier/more important
3. **Predictable** - Designers know which token to use
4. **Maintainable** - Change once, updates everywhere
5. **Themeable** - Easy to adjust brand feel globally

### Box Design Language

Box uses **soft, friendly corners** throughout:
- Never sharp 0px corners (feels harsh)
- Never overly rounded >12px (feels toy-like)
- Exception: Pills and circles for specific UI patterns

## Anti-Patterns to Avoid

❌ **Don't mix radius values on similar elements**
```css
.button-a { border-radius: 8px; }
.button-b { border-radius: 10px; } /* Too close, no clear reason */
```

❌ **Don't use arbitrary values**
```css
.card { border-radius: 9px; }  /* Why 9? Use 8 or 12 */
.tab { border-radius: 18px; }  /* Use 999px for pills */
```

❌ **Don't make everything the same**
```css
* { border-radius: 8px; } /* No hierarchy */
```

✅ **Do use semantic tokens**
```css
.button { border-radius: var(--radius-md); }
.card { border-radius: var(--radius-lg); }
.icon-btn { border-radius: var(--radius-circle); }
```

✅ **Do match radius to element purpose**
```css
/* Actions = medium, containers = large, icons = circle */
.action-btn { border-radius: var(--radius-md); }
.content-card { border-radius: var(--radius-lg); }
.avatar { border-radius: var(--radius-circle); }
```

## Testing the System

Check consistency:
```bash
grep "border-radius" src/components/AgentChatInterface.css
```

Should only see:
- `var(--radius-sm)`
- `var(--radius-md)`
- `var(--radius-lg)`
- `var(--radius-pill)`
- `var(--radius-circle)`
- Fixed `3px` (for accent bars only)

No raw px values except for special cases!

## Migration Notes

**Before:** Mixed values (6px, 8px, 10px, 12px, 999px, 50%)
**After:** Systematic tokens with clear purposes

**Changes made:**
- All standard buttons: 8px → `var(--radius-md)`
- All cards: 10px/12px → `var(--radius-lg)` (unified)
- All pills: 999px → `var(--radius-pill)`
- All circles: 50% → `var(--radius-circle)`
- Small elements: 6px → `var(--radius-sm)`

**Result:** 100% consistent border-radius system with clear semantic meaning.
