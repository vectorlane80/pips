# Spec 41 — Skip-Bo screens

Second of 3 specs building Skip-Bo (read `CHARTER.md` first, in full —
it locks which parts of `Design Handoff/SKIPBO.md` to take and which to
reject). Spec 40's engine (`src/card-games/skipbo/{deck,state,rules,
bot}.ts`) is done and landed — do not touch it. This spec is screens
only, no wiring yet (App.tsx comes in spec 42) — write these screens
against the engine's real types, but they won't be reachable from the
running app until spec 42 lands. That's expected and fine.

Read these sibling files FIRST, in full, before writing anything:
- `src/components/Phase10Card.tsx`/`.css` — closest template for a
  numbered+wild (non-suited) card component. Skip-Bo's card is
  structurally very close to this.
- `src/components/PlayingCard.tsx`/`.css` — specifically its corner-
  index-number rendering (`playing-card__corner`), which Skip-Bo's
  hand cards need a variant of (see "Cards" below for the exact
  difference).
- `src/screens/RummyRoom.tsx` — N-seat lobby template.
- `src/screens/RummyTable.tsx`/`.css` and `src/screens/
  Phase10Table.tsx`/`.css` — table shell, opponent tile grid (already
  fixed this session with a `max-width` cap — copy the CAPPED version,
  do not reintroduce the lone-tile-stretches bug), `DealIntro` usage,
  select-then-confirm interaction pattern.
- `src/screens/RummyResults.tsx` — results screen template (you'll
  deviate from its score-table shape, see "Results" below, but the
  shell/rematch-button pattern is the same).
- `src/components/DealIntro.tsx` — read `estimateDealIntroMs`,
  `DealIntroOtherSeat`, and the full prop list before using it.

You own creating exactly these new files. Do not touch any existing
file, and do not touch the spec-40 engine files:

- `src/components/SkipBoCard.tsx` (+ `SkipBoCard.css`)
- `src/screens/SkipBoRoom.tsx`
- `src/screens/SkipBoTable.tsx` (+ `SkipBoTable.css`)
- `src/screens/SkipBoResults.tsx`

## `SkipBoCard.tsx` / `.css`

Two components, mirroring `Phase10Card`'s file shape (a face component
+ a back component in the same file):

**`SkipBoCard`** — props: `card: Card`, `size: 'hand' | 'tile'`
(`'tile'` covers build-pile / discard-pile / stockpile-top rendering —
CHARTER.md's "smaller tiles show only the centered number," no need
for a 3-way size split when 2 covers the real visual difference),
`selected?: boolean`, `className?`, `style?`, `onClick?`.

- **Face color**: 1–4 teal `#0fb5a0` (white text), 5–8 amber `#ff9f1c`
  (ink text — contrast, matching the handoff's own reasoning), 9–12
  violet `#6c4cff` (white text). Compute from `Number(card.rank)`, not
  a suit lookup (Skip-Bo's `suit` is just `'number'`/`'special'`, not a
  color name like Phase 10's).
- **Wild card** (`card.meta?.kind === 'wild'`): rainbow diagonal
  gradient background, white center circle, "SB" in ink — CSS
  `linear-gradient` for the rainbow diagonal is fine, pick reasonable
  stops (e.g. red→orange→yellow→green→blue→violet), then an absolutely
  -positioned centered white circle with "SB" text on top. No inline
  hex lookup table needed for this one, it's a fixed one-off style.
- **Corner index numbers — `size === 'hand'` only**: top-left AND
  bottom-right (rotated 180°) small number labels, matching a real
  playing card's two-corner convention — mirror `PlayingCard.tsx`'s
  `playing-card__corner` positioning CSS but add a second corner
  instance with `transform: rotate(180deg)` for the bottom-right one
  (Rummy's own corner is top-left only, this is a genuinely new detail
  Skip-Bo needs per the design doc). Wild cards get "SB" in both
  corners instead of a number, styled smaller than the big center "SB".
  `size === 'tile'` cards show ONLY the centered number/SB, no corners
  at all.

**`SkipBoCardBack`** — same prop shape as `Phase10CardBack`
(`size: 'fan' | 'stock'`, `canDraw?`, `className?`, `style?`,
`onClick?`). Flat two-tone design: navy ink (`#17173a`) background, a
rotated pink (`#be185d`) square badge reading "SB" centered on top — no
dashed inset ring, no gold. This is Skip-Bo's OWN card back, distinct
from every sibling's — do not reuse `CardBack`/`Phase10CardBack`/
`UnoCardBack`.

## `SkipBoRoom.tsx`

Direct mirror of `RummyRoom.tsx`'s N-seat lobby (2–4 seats, using
`SKIPBO_MIN_SEATS`/`SKIPBO_MAX_SEATS` from `../card-games/skipbo/
state`): repeatable "Add house bot" capped at 4, "Start game" gated at
2, seat slots rendered up to the max with "Open seat" placeholders.
Brand chip: `#be185d` (Skip-Bo's accent color, not used by any other
game).

## `SkipBoTable.tsx` / `.css`

Single continuous white card shell (4px ink border, radius 28,
`0 10px 0` ink shadow) — same as Phase 10/Rummy's table shell, NOT the
handoff's three-panel zoned layout. Structure, top to bottom:

1. **Header row** (above the table card, same position every sibling
   uses): `TableHeader` (`gameLabel="Skip-Bo"`, `gameColor="#be185d"`)
   plus a "cards left" chip row underneath it — one chip per seat:
   colored dot + name + stockpile count, with a "fewest wins" caption
   (this one framing detail from the handoff's header is fine to keep,
   it's content not layout — mirror how Phase 10's own scoreboard chip
   row sits under its header).
2. **Deal intro** (`showIntro` state, same pattern as Rummy/Phase10):
   render `<DealIntro others={...} yourHandSize={5}
   renderCardBack={(p) => <SkipBoCardBack {...p} />}
   onComplete={() => setShowIntro(false)} />` — `others` is each
   opponent seat with `handSize: 5` (NOT their stockpile size — the
   stockpile is never part of this animation, see below). While
   `showIntro` is true, stockpiles/build piles/discard piles should
   still be considered "already dealt" underneath — they just aren't
   shown mid-animation, exactly like Rummy/Phase10 don't show the play
   scene at all until `onComplete` fires. No separate "shuffling"
   status text or shake animation of your own — `DealIntro` already
   owns that whole sequence end to end.
3. **Opponent tile grid** (`.sb-opp-rail`/`.sb-opp-tile`, same
   mechanics as `.rummy-opp-rail`/`.rummy-opp-tile` — wrapping flex,
   `flex: 1 1 260px`, **`max-width: calc((100% - 3 * gap) / 4)`** —
   copy this cap from the start, Rummy/Phase10 only got it added after
   a bug report this session, don't reintroduce it here). Per opponent
   tile: seat dot + name, hidden hand-back fan (`SkipBoCardBack
   size="fan"`, capped `Math.min(handCount, 14)`) + hand count, their
   stockpile as a single `SkipBoCardBack size="stock"` tile + count
   (not selectable — you can never touch another seat's stockpile),
   their 4 discard-pile tops rendered as small `SkipBoCard size="tile"`
   faces (or an empty-pile outline per this session's own recent
   Rummy fix — reuse that pattern: a dashed empty rectangle when a
   discard pile has no top card, not a blank space). Turn-fill
   highlight on the active opponent's tile, same as every sibling.
4. **Building piles row** — 4 tiles between the opponent grid and your
   own area, each showing: the pile's top card as a real `SkipBoCard
   size="tile"` face (empty-pile dashed outline when `cards.length ===
   0`), a "needs N" label above using `nextNeeded`, and the shared draw
   pile (`SkipBoCardBack size="stock"` + `drawCount`) rendered in this
   same row — it belongs here since every seat draws from it, not
   under "your side" (this one detail from the handoff's layout is
   correct, keep it even though the panel structure around it isn't).
   No 12-dot progress track — "needs N" text is the whole indicator,
   consistent with how every other game states requirements as plain
   text rather than a bespoke widget.
5. **Your own area**: your stockpile top (`SkipBoCard size="tile"`,
   selectable) + your 4 discard-pile tops (selectable, same empty-
   outline treatment as opponents' when empty) + your hand (sorted —
   see "Hand sort" below), all using the select-then-confirm model:
   click to select (stockpile top / a hand card / one of your own
   discard-pile tops — exactly the 3 sources `PLAY_STOCK`/`PLAY_HAND`/
   `PLAY_DISCARD` cover), a pink ring (`box-shadow` or `border`
   in `#be185d`) marks the selection, then:
   - **Play button** — enabled whenever something is selected; enabled
     state should also reflect actual legality (compute client-side
     via the same `chooseBuildPile`-style check the engine exports, or
     just always enable it and let the host reject — check what Rummy
     does for its own play-button enablement and match that precedent
     rather than inventing a new approach).
   - **Discard button** — enabled only when a HAND card is selected
     (matches `DISCARD`'s engine-side restriction to hand cards).
   - **Pass button** — visible only when your hand is empty (mirrors
     `PASS`'s engine-side legality), same as the handoff describes.

## Hand sort

Spec 40 confirmed the engine leaves `hand.cards` in raw append order,
matching Rummy's own precedent of sorting only at the UI layer. Add a
`sortSkipBoHand(cards: Card[]): Card[]` pure helper in
`SkipBoTable.tsx` (same shape as Rummy's own `sortHand`): ascending by
rank (`Number(card.rank)`), wild cards last (a wild's rank is a string
`'WILD'`, not a number — treat it as sorting after 12). Document this
choice with a one-line comment; it's an explicit decision spec 40
deferred to you, not an oversight to leave unresolved.

## `SkipBoResults.tsx`

Announces the single round/game winner — NOT a score table (Skip-Bo
has no `scores`, only `winnerId`). Mirror `RummyResults.tsx`'s shell
(header, rematch button, back-to-shelf) but replace its score-sorted
row list with: the winner called out first/prominently ("**{name}**
went out first!" or similar), then every seat's FINAL stockpile count
listed as a fun stat (ascending — fewest-remaining next-best, matching
the header chip row's own "fewest wins" framing), not styled as a
competitive ranking table the way Rummy's score list is (no numbered
1st/2nd/3rd — just names + final stockpile counts under the winner
callout). Rematch button creates a completely fresh
`createSkipBoGame(seatOrder, newSeed)` — no running score to carry
forward, matching Battleship/Dominoes/Checkers/Chess's rematch
precedent, NOT Rummy/Phase10/Uno's "next round" model.

## Verify before reporting

`npx tsc -b --noEmit`, `npm test -- --run` (expect 1017 unchanged —
screens don't get dedicated test files in this codebase's established
practice, same as every prior screens spec), `npm run build`. Since
nothing wires these screens into the running app yet, you have no way
to visually verify any of this — say so plainly. Report a summary,
every judgment call, and specifically confirm: the two-corner index-
number rendering, the wild card's rainbow gradient approach, the
building-pile row's placement of the shared draw pile, the empty-
discard-pile dashed-outline reuse, and the hand-sort tie-break for
wilds.
