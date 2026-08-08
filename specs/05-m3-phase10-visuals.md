# Spec 05 — M3: Phase 10 card-visual components

Read `CLAUDE.md` first — binding. Read `src/components/PlayingCard.tsx` and
`src/components/PlayingCard.css` (Rummy's card-visual components) as your
structural pattern reference — same component shape (a card-face component
+ a card-back component, both plain `<button>`s, CSS classes + CSS custom
properties, no styled-components/CSS modules), adapted for Phase 10's very
different card fronts (solid color tiles, not suit+rank). Read
`Design Handoff/design_handoff_pips 2/PHASE10.md` (§"Why the deck looks
different from Rummy" and §"Layout spec") for the exact visual spec this
implements — it's quoted in full below so you don't need to re-read it,
but the source is there if anything is ambiguous.

## Files you own
```
src/components/Phase10Card.tsx
src/components/Phase10Card.css
```
Do not modify `PlayingCard.tsx`/`.css` or any other file. Do not run
`git commit`.

## Card model this component renders

A Phase 10 `Card` (from `src/card-engine/cards.ts`, already widened to
`{id, suit: string, rank: string, deckIndex, meta?}` by M0) has, per
`src/card-games/phase10/deck.ts`:
- **Number card**: `suit` is one of `'red'|'blue'|'green'|'yellow'`,
  `rank` is `'1'`..`'12'`, `meta.kind === 'number'`.
- **Skip card**: `suit === 'special'`, `rank === 'SKIP'`,
  `meta.kind === 'skip'`.
- **Wild card**: `suit === 'special'`, `rank === 'WILD'`,
  `meta.kind === 'wild'`.

Always branch on `meta?.kind`, never parse `rank`/`suit` strings to infer
which kind a card is (same convention `classify.ts` already uses).

## Colors (exact hex, from the design handoff)

```
red:    #ff5d73
blue:   #6c4cff
green:  #1aa06d
yellow: #ffd23f
ink:    #17173a   (should already exist as var(--ink) in tokens.css — use
                    the CSS variable, not a literal hex, if it does; check
                    src/styles or wherever tokens.css lives before hardcoding)
```
Export a small color lookup so the screen component (M4) can reuse it for
non-card UI (e.g. a color-coded phase requirement icon) if needed:
```ts
export const PHASE10_COLORS: Record<'red' | 'blue' | 'green' | 'yellow', string> = {
  red: '#ff5d73', blue: '#6c4cff', green: '#1aa06d', yellow: '#ffd23f',
}
```

## `Phase10Card` component

```ts
export type Phase10CardSize = 'hand' | 'group' | 'discard'

export interface Phase10CardProps {
  card: Card   // from '../card-engine/cards.ts'
  size: Phase10CardSize
  selected?: boolean
  className?: string
  style?: React.CSSProperties
  onClick?: () => void
}

export function Phase10Card({ card, size, selected, className, style, onClick }: Phase10CardProps): JSX.Element
```

Rendering by `card.meta?.kind`:
- **`'number'`**: background = `PHASE10_COLORS[card.suit as 'red'|'blue'|'green'|'yellow']`; the number (`card.rank`) centered, large, bold. Text color: white, **except** on the yellow tile (`card.suit === 'yellow'`) where it must be `var(--ink)` for legibility — this is explicit in the design handoff ("number centered in white (or ink on yellow)").
- **`'skip'`**: background solid `var(--ink)` (or the literal ink hex if no
  such CSS variable exists — check first); centered white text reading
  `SKIP` (smaller font than the number tiles' number, since it's a whole
  word — pick a size that fits the card width without wrapping at the
  `hand` size, e.g. proportionally similar to how a 2-digit number like
  "12" would render).
- **`'wild'`**: background a 4-stop diagonal gradient through all four
  colors in this exact order: `linear-gradient(135deg, #ff5d73 0%,
  #6c4cff 33%, #1aa06d 66%, #ffd23f 100%)`; centered white text reading
  `WILD`.

Sizes and interaction states (`hand` is the primary, fully-specified one
from the design handoff; `group`/`discard` are judgment calls scaled from
it the same way Rummy's own `PlayingCard.css` scaled its `meld`/`discard`
sizes from its `hand` size — see the comments already in that file for the
precedent, and leave an equivalent comment here):

- **`hand`**: `70×100`, `border-radius: 14px`. Base state: border color
  `var(--ink)`, some border width + drop-shadow consistent with the rest
  of the app's card-like elements (look at `.playing-card--hand` in
  `PlayingCard.css` for the exact border-width/shadow convention used
  elsewhere in this codebase — reuse the same values, e.g. `4px` border,
  `0 6px 0 var(--grey-border)` shadow, since nothing in PHASE10.md
  contradicts reusing Rummy's established weight). Hover (not selected):
  `translateY(-9px)`. Selected: border color `var(--yellow)` (`#ffd23f`),
  `translateY(-18px)`, and a correspondingly darker shadow tone (reuse
  `PlayingCard.css`'s `--_selected-shadow: #e0a800` convention).
- **`group`** (a card inside an already-laid phase group on the table —
  Rummy calls the equivalent size `meld`): scale down from `hand` at the
  same ratio Rummy used (`meld` is `38×54` from a `74×104` hand, ratio
  ≈0.514/0.519) — for a `70×100` hand that's **`36×52`**, `border-radius:
  8px`, `border-width: 3px`, border color `var(--card-owner-color,
  var(--green-text))` (reuse the exact same CSS-custom-property pattern
  `PlayingCard.css` uses for per-owner meld coloring — accept the same
  `ownerColor`/`ownerShadow` optional props `PlayingCard`'s meld size
  does, even though PHASE10.md doesn't literally restate this — it's the
  same spatial-ownership requirement PHASE10.md's own layout spec
  describes ("their laid groups... each with a small 'phase N' caption
  above it in their color")). Document this as a judgment call in your
  report, same category as `PlayingCard.css`'s own documented ones.
- **`discard`**: PHASE10.md is explicit that only the top discard card is
  ever shown/interactable (no reach-in, no fanned strip) — size it the
  same as Rummy's discard card, `50×70`, `border-radius: 10px`,
  `border-width: 3px`, border color `var(--ink)`, shadow `0 4px 0
  var(--grey-border)` (reuses Rummy's own already-made judgment call for
  an unspecified discard size, for visual consistency between the two
  card games' equivalent slot — also worth a one-line comment).

`onClick` behavior: same convention as `PlayingCard` — render a
`<button type="button" disabled={!onClick}>`, `aria-label` describing the
card (e.g. `"7, red"`, `"Skip"`, `"Wild"`, plus `", selected"` when
`selected` is true).

## `Phase10CardBack` component

```ts
export type Phase10CardBackSize = 'fan' | 'stock'

export interface Phase10CardBackProps {
  size: Phase10CardBackSize
  canDraw?: boolean   // stock only — ring turns var(--yellow) when drawable
  className?: string
  style?: React.CSSProperties
  onClick?: () => void
}

export function Phase10CardBack({ size, canDraw, className, style, onClick }: Phase10CardBackProps): JSX.Element
```

Exactly per PHASE10.md: flat ink background (`#17173a` / `var(--ink)`), a
thin yellow keyline inset 3-5px (`1.5px solid rgba(255,210,63,0.55)`), a
small yellow **"10"** centered — this is a real, deliberate design
decision (the doc explicitly says an earlier rainbow-striped version was
tried and rejected as hard to read at fan size — implement the flat ink
version, don't "improve" on it). Implementation note: a CSS `outline` or
an absolutely-positioned inset pseudo-element/inner `<span>` both work for
the inset keyline — pick whichever is simpler, it's a rendering detail
PHASE10.md doesn't dictate.

Sizes (both explicitly given in PHASE10.md, identical to Rummy's own
equivalents — reuse those exact values):
- **`fan`** (opponent's hidden hand): `30×44`, `border-radius: 7px`.
- **`stock`**: `56×78`, `border-radius: 11px`; ring/border turns
  `var(--yellow)` when `canDraw` is true (else stays ink); same hover-lift
  convention as Rummy's stock card-back (`translateY(-6px)` on hover when
  clickable) — reuse that exact interaction, PHASE10.md doesn't contradict
  it and it's the established convention for "this pile is drawable."

## Verification (run yourself before reporting)

```
npx tsc -b --noEmit
npm run build
```
(No new tests required — this is a presentational-only milestone with no
game logic, same as Rummy's M3, which per `docs/DEVLOG.md` deliberately
skipped review/tests for the same reason: nothing here to get logically
wrong, just render it and check it compiles.) Also do a quick manual
sanity check: temporarily render one of each card kind/size in
`src/App.tsx` or a scratch file, confirm no console errors, then remove
the scratch render before reporting (don't leave demo code in the tree —
mirror Rummy's own M3 process, which used "a temporary demo render
in-browser" per `docs/DEVLOG.md` and then removed it).

Report: files created, any judgment call (there are a few, called out
above — restate them concisely), confirm no `git commit` was run and no
scratch/demo code was left behind.
