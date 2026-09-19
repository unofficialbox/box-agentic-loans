# Design Refinements

Expert design refinements applied based on **box-open-elements** design system best practices.

## Typography

### Font Loading
- **InterVariable** loaded from Box's CDN (official Box typeface)
- Same source as `box-ui-elements` uses
- Font weights 400-700 with variable weight support
- `font-display: swap` for progressive enhancement

### Type Scale
```css
body: 15px base (Box standard)
Headings: 700 weight with -0.02em tracking
Empty state heading: 42px / 700 / -0.03em
Session title: 17px / 700 / -0.01em
Labels: 11-13px / 600-700 / 0.02-0.05em
```

### Principles
- **Tight tracking** on large display text (-0.03em)
- **Letter-spacing** on uppercase labels (0.02-0.05em)
- **Font weights** 500-700 (no light weights for legibility)

## Color Palette

### Box Blue System
```css
--box-blue: #0061D5 (primary brand)
--box-blue-dark: #004FB2 (accessible text, 4.5:1 on white)
--box-blue-light: #F2F7FD (subtle backgrounds)
--box-blue-hover: #0052B8 (interactive hover)
```

### Neutrals (Refined Grays)
```css
--text-primary: #1f1e1b (near-black, warm)
--text-secondary: #6f6f6f (mid-gray)
--text-tertiary: #9b9b9b (light gray for placeholders)

--surface-primary: #ffffff (cards, inputs)
--surface-secondary: #f7f8fa (stage background)
--surface-hover: #f4f4f4 (subtle hover)

--border-light: #e8e8e8 (hairlines)
--border-medium: #d4d4d4 (standard borders)
--border-dark: #b4b4b4 (emphasis)
```

**Why these specific grays?** Box's actual design system values, tested for accessibility and visual hierarchy.

## Shadows & Depth

### Shadow System
```css
--shadow-sm: 0 1px 3px rgba(0, 0, 0, 0.06)
--shadow-md: 0 2px 8px rgba(0, 0, 0, 0.08)
--shadow-lg: 0 4px 16px rgba(0, 0, 0, 0.12)
--shadow-offset: 4px 4px 0 rgba(0, 97, 213, 0.12)
```

**Pattern from docs-site:**
- Offset shadows (4px 4px 0) for CTAs and important actions
- Soft shadows (2-4px blur) for cards and elevation
- Blue-tinted shadows (Box brand) for primary actions

### Applied To
- **New button**: offset shadow with blue tint
- **Send button**: medium shadow scaling to large on hover
- **Cards**: small shadow resting, medium on hover
- **Input focus**: large shadow for emphasis

## Focus States

### Pattern
```css
box-shadow: 0 0 0 3-4px rgba(0, 97, 213, 0.3)
```

**Why box-shadow vs outline?**
- Respects border-radius (follows button/card shapes)
- Can animate smoothly
- Doesn't affect layout (no offset jumps)
- Better visual weight control

**Ring sizes:**
- 3px: Standard controls (buttons, inputs)
- 4px: Primary actions (send button)

## Interactive States

### Button Progression
```
Rest → Hover → Focus → Active
- Border weight change (1.5px → solid color)
- Background shift (transparent → tinted)
- Shadow increase (sm → md → lg)
- Transform for emphasis (translateY, scale)
```

### Timing
```css
transition: all 0.15s ease (standard)
transition: all 0.2s ease (input focus - more deliberate)
```

**15ms vs 200ms:** Quick for hover/click feedback, slower for focus to feel intentional.

## Spacing System

### Rhythm
```
Tight (6-7px): Related controls in a group
Standard (10-14px): Component spacing
Loose (16-24px): Section spacing
Extra (28-40px): Major layout regions
```

### Applied
- **Input controls**: 10px gap (comfortable touch targets)
- **Document grid**: 14px gap (breathing room)
- **Header padding**: 16px vertical, 28px horizontal
- **Empty state**: 40px between sections (dramatic spacing)

## Border Radius System

**Consistent token-based system for visual harmony:**

```css
--radius-sm: 6px     /* Small elements, tight corners */
--radius-md: 8px     /* Standard buttons, controls */
--radius-lg: 12px    /* Cards, inputs (friendly) */
--radius-pill: 999px /* Pills, tags, badges */
--radius-circle: 50% /* Icon-only buttons */
```

**Application:**
- Buttons/controls: `--radius-md` (8px)
- Cards/containers: `--radius-lg` (12px)
- Pills/tabs: `--radius-pill` (999px)
- Icon buttons: `--radius-circle` (50%)
- Small elements: `--radius-sm` (6px)

**Why this scale?** 6:8:12 creates clear hierarchy without jarring jumps. Each value has semantic meaning tied to component purpose.

See [BORDER-RADIUS-SYSTEM.md](./BORDER-RADIUS-SYSTEM.md) for complete reference.

## Component Patterns

### Cards
```css
border: 1.5px solid (slightly heavier than 1px)
border-radius: var(--radius-lg) (12px - friendly)
padding: 14-16px (comfortable hit area)
hover: translateY(-1px) or translateX(2px)
```

**Motion on hover:** Cards lift/shift to show interactivity without being aggressive.

### Rails & Sidebars
```css
Box blue background (#0061D5)
White text with 70% opacity at rest
Active: white text + left accent bar (3px)
Focus: white outline inset (-2px)
```

**Why inset focus?** Keeps focus ring inside the rail's visual boundary.

### Input Fields
```css
2px border (heavier than cards for emphasis)
border-radius: 12px (more rounded for friendliness)
Focus ring: 4px with blue tint
Multi-line: max-height with scrolling (no layout jumps)
```

## Accessibility

### Contrast Ratios
- **Text on white**: #1f1e1b = 15.8:1 (AAA)
- **Blue on white**: #004FB2 = 7.5:1 (AAA for large text)
- **Secondary text**: #6f6f6f = 4.6:1 (AA)

### Focus Indicators
- **Visible at all times** when focused (no :focus-visible hacks that hide too much)
- **Adequate size**: 3-4px rings clear accessibility audit thresholds
- **Color contrast**: Blue ring on light backgrounds = 3.5:1 minimum

### Touch Targets
- **Minimum 36px × 36px** (icon buttons)
- **Minimum 44px × 44px** (send button)
- **Padding creates hit area** even when visual is smaller

## Responsive Strategy

### Breakpoints
```
1100px: Grid compression, narrower documents
768px: Single column, collapsible sidebar
```

**Why these values?**
- 1100px: Where document grid needs to shrink from 160px to 120px
- 768px: Standard tablet portrait, natural mobile breakpoint

### Adaptive Behaviors
- **Sidebar**: Hides completely on mobile (would be too narrow to be useful)
- **Header**: Reduced padding on mobile (12px vs 16px)
- **Empty heading**: Scales from 42px to 32px (maintains hierarchy)
- **Controls**: Wrap naturally with flexbox gap (no grid lock-in)

## Design Principles Applied

From box-open-elements docs-site:

1. **Semantic tokens** over raw values (easier theming)
2. **Offset shadows** for important actions (editorial feel)
3. **Proper focus rings** with adequate contrast (accessibility first)
4. **Consistent spacing rhythm** (visual harmony)
5. **Progressive enhancement** (InterVariable loads, fallback to system fonts)
6. **Motion with purpose** (hover indicates interactivity, not decoration)
7. **Border weights** create hierarchy (1.5px for emphasis vs 1px hairlines)
8. **Border radius** communicates function (8px = standard, 999px = pill, 12px = friendly input)

## What Changed

### Before → After

**Typography:**
- Generic Inter from CDN → Official Box InterVariable
- Inconsistent weights → Systematic 500-700 scale
- Missing letter-spacing → Proper tracking on labels

**Colors:**
- CSS vars with raw hex → Semantic token system
- Inconsistent hover states → Unified blue tint pattern
- Generic shadows → Box-branded blue-tinted shadows

**Border Radius:**
- Mixed values (6/8/10/12/999/50%) → Token system with semantic meaning
- Arbitrary choices → Clear hierarchy (sm/md/lg/pill/circle)
- Inconsistent cards (10px vs 12px) → Unified at --radius-lg (12px)
- Raw px everywhere → Tokens only (--radius-*)

**Spacing:**
- Arbitrary values → Consistent 6/10/14/16/24/28 rhythm
- Tight everything → Breathing room where it matters

**Focus:**
- Outline-based → Box-shadow rings
- Inconsistent sizes → 3px standard, 4px primary
- Missing on some controls → Comprehensive coverage

**Motion:**
- No transform → Subtle lifts and shifts
- Instant → 150ms ease transitions
- Inconsistent timing → Standardized durations

**Components:**
- 1px borders → 1.5-2px for proper weight
- Raw border-radius values → Token-based system
- Flat hover states → Layered shadow/transform progression

## Performance Notes

- **InterVariable**: Single woff2 file, variable weight (smaller than loading multiple weights)
- **Shadow compositing**: Uses `box-shadow` vs multiple divs (GPU-accelerated)
- **Transform**: Triggers GPU layer (smooth animations)
- **Transition timing**: 150ms = imperceptible to fast users, clear to everyone else

## References

- Box Open Elements: https://github.com/unofficialbox/box-open-elements
- Docs site DESIGN.md: Design language and token system
- Docs site styles.css: Production implementation patterns
- Box UI Elements: Official Box component library
