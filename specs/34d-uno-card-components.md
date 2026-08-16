# Spec 34d — Uno card components (face, back, hand fan)

First of three screens specs (34d components → 34e table screen → 34f
room/results/wiring), mirroring this project's established screens-then-
wiring split (see Battleship/Checkers/Mexican Train's spec pairs). This
spec is presentational components ONLY — no game logic, no App.tsx, no
room/table screens yet.

You own EXACTLY these two new files:

- `src/components/UnoCard.tsx`
- `src/components/UnoCard.css`

Do NOT touch any other file. Before writing, READ
`src/components/Phase10Card.tsx` and `src/components/Phase10Card.css` in
full — mirror their component-per-visual-state shape (a card face
component, a card back component, both taking `size`/styling props) and
their CSS organization (base class + kind-specific modifier classes +
size modifier classes). Also read `Design Handoff/UNO.md` in full (already
in the repo) — it is the locked visual spec for every detail below.

## Design decisions (locked)

- **Card back** (`UnoCardBack`): dark ink card, a red diagonal band, the
  Pips two-dot mark tilted across it — an ORIGINAL mark, explicitly not a
  reproduction of any commercial card game's back. Brand color `#e11d2e`
  for the band. Take a `size: 'fan' | 'stock' | 'small'` prop (same three-
  tier convention as Rummy/Phase10/Dominoes card backs — `fan` = your own
  hand's back-facing context if ever needed, `stock` = the draw pile,
  `small` = an opponent's hidden hand count display) and an optional
  `onClick`/`disabled` pair for the stock-pile draw interaction — mirror
  `Phase10CardBack` exactly for this part: it's a `<button>`, legality is
  expressed by whether `onClick` is defined (`disabled={!onClick}`), and
  the "gold ring when legal" is a CSS modifier class swap on the stock
  size variant (`.uno-card-back--stock.uno-card-back--can-draw { border-
  color: var(--yellow); }`), not a separately-rendered ring element —
  copy this pattern's exact mechanics from `Phase10Card.tsx:126-163` and
  the corresponding CSS block.
- **Card face** (`UnoCardFace`): colored rounded-rect card. Props:
  `color: 'red'|'yellow'|'green'|'blue'|'wild'`, `kind:
  'number'|'skip'|'reverse'|'draw2'|'wild'|'wild4'`, `value: number|null`,
  and `size: 'hand'|'discard'` (hand = your own fanned hand and an
  opponent's — wait, opponents' hands render as `UnoCardBack` not faces,
  see below; `hand` size is for YOUR OWN hand only; `discard` = the
  discard pile's top card, likely larger). Bold corner value top-left,
  the SAME value mirrored bottom-right via `transform: rotate(180deg)`
  (an actual rotated duplicate element, not a CSS trick on the same
  element — Uno's real cards do this, it needs to read correctly upside-
  down too), a big center symbol on a tilted white badge circle (a
  circular white div, `transform: rotate(-8deg)` or similar per the
  handoff's "tilted white badge circle" language — pick a fixed small
  tilt angle, e.g. -8deg, and use it consistently for every card kind,
  not varied per-card).
  - Number cards: the number itself (0-9) as both the corner marks and
    the center symbol.
  - `skip`: ⊘ as both corner marks and center symbol.
  - `reverse`: ⇄ as both corner marks and center symbol.
  - `draw2`: "+2" as both corner marks and center symbol.
  - `wild`/`wild4`: NO colored background — instead a diagonal four-color
    gradient band, mirroring Phase10's wild technique EXACTLY:
    `linear-gradient(135deg, #ff5d73 0%, #6c4cff 33%, #1aa06d 66%, #ffd23f 100%)`
    (same colors, same angle, same stops — copy verbatim from
    `Phase10Card.css`'s `.phase10-card--wild` rule, this is a deliberate
    shared-technique reuse, not a coincidence). Center label: "WILD" for
    `wild`, "+4" for `wild4` — text, not a star glyph (the handoff
    explicitly says an earlier draft's star glyph read as unclear and was
    replaced with text; do not use a star). No corner marks for wild
    cards (a wild card's identity doesn't need corner duplication the way
    a number/action card's does — just the center label once).
- **Playable-card affordance**: per the handoff, explicitly NO opacity
  dimming and NO highlight ring on playable vs. unplayable cards in the
  hand — both were tried in the original prototype and reverted (opacity
  broke against the overlapping fan; a ring was cut per direct request).
  Only the cursor (`pointer` vs `default`) and whether an `onClick` is
  even wired differ. This component takes `onClick?: () => void` — the
  CALLER (the table screen, spec 34e) decides whether to pass a click
  handler based on legality; this component itself does not know or care
  whether it's "playable," it just renders a card and optionally reacts
  to a click if given one. Do not add a `playable` or `legal` prop to
  this component — that decision lives one layer up.
- **Fanned hand layout**: this spec does NOT render a hand or a fan
  layout — that's the table screen's job (spec 34e), which will render a
  list of `UnoCardFace` elements with the `margin-left:-30px`-per-card,
  ascending-z-index CSS applied at the CONTAINER level in the table
  screen's own CSS file, exactly like Rummy/Phase10's hand fans. This
  spec's job is only the single-card components; do not add fan-layout
  CSS to `UnoCard.css` — that belongs in the table screen's CSS file
  later, keep this file scoped to individual card rendering only.

## Component signatures

Correction to how this spec was originally drafted: `Phase10Card.tsx`
actually takes a `card: Card` object prop (from the card-engine layer),
NOT primitive props — mirror THAT pattern, not primitives. Import
`UnoCard` as a type from `../card-games/uno/deck.ts` and take it directly:

```tsx
import type { UnoCard } from '../card-games/uno/deck.ts'

export function UnoCardBack({
  size, onClick, disabled,
}: {
  size: 'fan' | 'stock' | 'small'
  onClick?: () => void
  disabled?: boolean   // only meaningful for size 'stock' — an explicit disabled prop separate
                        // from "no onClick", since the stock pile is always rendered (with a
                        // count) even when not currently clickable; mirror how Phase10CardBack
                        // handles this (re-check its exact disabled/onClick interplay before
                        // writing this — do not guess, read the file)
}): JSX.Element

export function UnoCardFace({
  card, size, onClick,
}: {
  card: UnoCard
  size: 'hand' | 'discard'
  onClick?: () => void
}): JSX.Element
```

Both are plain function components. `UnoCardFace` derives `color`/`kind`/
`value` from `card.color`/`card.kind`/`card.value` internally (same as
`Phase10Card` derives `kind` from `card.meta?.kind`) — this is a
deliberate, already-established exception to "presentational components
stay engine-decoupled": this codebase's actual convention for card-game
components is to take the card object directly, not decompose it at the
call site. Follow the real precedent, not a stricter decoupling that
isn't actually how this codebase works.

## CSS conventions

Follow `Phase10Card.css`'s exact structural conventions: a base class per
component (`.uno-card-face`, `.uno-card-back`), kind/color modifier
classes (`.uno-card-face--red`, `.uno-card-face--wild`, etc.), size
modifier classes (`.uno-card-face--hand`, `.uno-card-back--stock`, etc.),
`:hover:not(:disabled)` / `:active:not(:disabled)` interaction states on
anything clickable, `border: 3px` or `4px` ink borders with a drop-shadow
`box-shadow` matching this project's card-game visual language (check any
sibling card CSS file — Rummy's `PlayingCard.css` or Phase10Card.css —
for the exact border-width/box-shadow values already established and
reuse them, don't invent new numbers). Brand red `#e11d2e` for the card-
back band and (where used) borders/accents specific to Uno.

## Verify before reporting

`npx tsc -b --noEmit` silent. This spec adds no tests (pure presentational
components with no logic to unit-test beyond what TypeScript itself
enforces — this matches how `Phase10Card.tsx` has no dedicated test file
either; confirm that's true before assuming it, and if Phase10Card DOES
have a test file, say so in your report and match that precedent instead
of skipping tests). `npm run build` must also stay clean (this is a new
component file that will be dead-code-imported by nothing yet until spec
34e wires it in — confirm the build doesn't choke on an unused-but-
exported component, which it shouldn't, but verify rather than assume).
Report files changed, verbatim tsc/build output, and confirm whether a
Phase10Card test file exists and what you did about it.
