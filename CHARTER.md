# Charter: Skip-Bo (2026-08-17)

Skip-Bo is a new N-player (2–4 seat) card game. Design handoff is at
`Design Handoff/SKIPBO.md`, fully implemented as a prototype and
**explicitly authoritative for rules and card art, explicitly NOT
authoritative for table layout or the deal/shuffle animation** — the
handoff's own "Layout" and "Deal & shuffle animation" sections invent a
new visual pattern (a three-panel zoned layout with horizontal opponent
row-stacking, and a Dominoes/Mexican-Train-style shuffle-shake) that
does not match this codebase's established card-game conventions. Per
explicit user instruction: **take the card designs and the game
mechanics from the handoff; do not take its layout or its deal/shuffle
animation.** This is a recurring failure mode with this design tool (see
`CLAUDE.md`'s "new games must pattern-match existing games" section,
written after Uno shipped with exactly this kind of isolated,
non-conforming design) — Skip-Bo is the second instance of it, this one
caught before any code was written instead of after.

Pre-approved by the user at invocation ("adhere specifically to how
we're handling other card games... /autonomous-dev-loop like always") —
running unattended, same routing as every prior charter this session:
deepseek implementing (Haiku fallback if deepseek becomes unavailable),
deepseek or the lead reviewing per risk level, lead does all specs/
verification/git/the mandatory live visual check.

## What to take from the handoff verbatim

- **Card faces**: solid color-fill by number range — 1–4 teal
  (`#0fb5a0`, white text), 5–8 amber (`#ff9f1c`, ink text), 9–12 violet
  (`#6c4cff`, white text), matching Phase 10's solid-tile convention.
  Wild card: rainbow diagonal gradient, white center circle, "SB" in
  ink. Hand-size cards get corner index numbers (top-left + bottom-right
  rotated 180°, matching a real playing-card feel — same convention
  Rummy's `PlayingCard` already uses); smaller tiles (stockpile/
  building-pile/discard) show only a centered number.
- **Card back**: navy ink (`#17173a`) with a rotated pink (`#be185d`)
  square badge reading "SB" — no dashed inset ring, no gold, distinct
  from Rummy/Phase10/Uno's own backs.
- **Accent color**: `#be185d` (rose/pink), not used elsewhere in the
  app — this is Skip-Bo's `gameColor` throughout (TableHeader, shelf
  tile, seat chips).
- **Rules** (SKIPBO.md's "Rules implemented" + "Bot" sections, verbatim):
  2–4 players, one shared 162-card deck (144 numbered 1–12 + 18 Skip-Bo
  wilds). Each seat's stockpile: 30 cards (2p) or 20 cards (3–4p). First
  to empty their stockpile wins **the whole game immediately, even
  mid-turn** — Skip-Bo has no scores/target/multi-round match layer,
  unlike Rummy/Phase10/Uno; this is a real, correct difference in the
  underlying game, not a layout choice, so it is NOT being forced into
  the scored-match shape those three share. A rematch starts a
  completely fresh deal, same as Battleship/Dominoes/Checkers/Chess's
  precedent for score-less 1-shot games.
  - Draw up to 5 cards at the start of your turn from the shared draw
    pile (reshuffles from the "used" pool — cards cleared off completed
    building piles — if the draw pile empties).
  - Play any number of cards per turn from your stockpile top, hand, or
    your own discard-pile tops onto the 4 shared building piles, in
    ascending order 1→12 (wild = any number). A pile that reaches 12
    clears into the "used" pool and restarts at 1.
  - End your turn by discarding exactly one hand card onto one of your
    4 personal discard piles (skippable only if your hand is already
    empty — a Pass action).
  - Bot priority loop, in order, looping until no legal play remains:
    (1) play the stockpile top if legal anywhere — never sits on a
    playable stockpile card; (2) else play from the top of any of its
    own discard piles if legal; (3) else play a legal hand card, numbered
    cards before its own wilds (hoards wilds for when it's actually
    stuck); (4) once no plays remain, discard its highest-value
    non-wild card (wilds only as a last resort).
  - Turn order: plain round-robin. `sbBeginTurn`-equivalent draws to 5
    and hands off to the bot loop if that seat is a bot — same "one
    entry point regardless of human/bot" shape Rummy/Phase10 use.

## What to build instead of the handoff's layout/animation

- **Shell & header**: same `TableHeader` component every other table
  uses (`gameLabel="Skip-Bo"`, `gameColor="#be185d"`), single continuous
  white card shell (4px ink border, radius 28, `0 10px 0` ink shadow) —
  matches Phase 10/Rummy's shell, NOT the three-panel zoned layout the
  handoff invented. The handoff's "cards left" chip row (colored dot +
  name + stockpile count, "fewest wins" caption) is fine to keep as
  content — it's the same shape as Phase 10's own score-chip row under
  the header, just with stockpile count instead of score.
- **Opponent area**: the wrapping seat-tile grid Rummy/Phase10 already
  use (`flex: 1 1 260px` + the `max-width: calc((100% - 3*gap)/4)` cap
  fixed this session — copy the capped version from the start, don't
  reintroduce the lone-tile-stretches bug). Each opponent tile: hidden
  hand-back fan + name + hand count, their stockpile tile, their 4
  discard-pile tops. NOT the handoff's horizontal full-width row-per-
  opponent layout.
- **Building piles**: the one genuinely new piece of table furniture
  Skip-Bo needs (no sibling has 4 shared community piles) — render as a
  row of 4 tiles between the opponent grid and the local player's own
  area, same visual weight/treatment as a meld/group cluster elsewhere
  (real card face on top, not a count), with a small progress indicator
  (a "needs N" label is fine, the handoff's 12-dot track is unnecessary
  polish — plain text is consistent with how Rummy/Phase10 show
  everything else). The shared draw pile renders here too (it belongs
  to the shared building-pile area, not to "your side," since every
  seat draws from it — this one framing detail from the handoff's
  layout is correct and worth keeping even though the panel structure
  around it isn't).
- **Your own area**: your stockpile (selectable) + your 4 discard piles
  (selectable) + your hand, using the SAME select-then-confirm
  interaction Rummy already established (click to select, a ring marks
  the selection, then Play/Discard/Pass buttons act on the selection) —
  not a bespoke interaction model.
- **Deal & shuffle**: the shared `DealIntro` component
  (`src/components/DealIntro.tsx`), exactly like Rummy/Phase10/Uno use
  it — NOT the handoff's borrowed Dominoes/Mexican-Train shuffle-shake.
  Stockpiles (30 or 20 cards) are dealt instantly as a settled pile the
  moment the round starts, since their count is public but their
  identity is private and there's nothing meaningful to animate
  card-by-card; only the 5-card starting hand goes through `DealIntro`'s
  normal per-card flight animation (`yourHandSize={5}`,
  `others={...}` with each seat's own `handSize: 5`). This reuses the
  exact mechanism the codebase already has for "public count, private
  identity, animate only the meaningful part" rather than inventing a
  new shuffle visual.
- **Hand sorting**: sorted (by rank, then wilds last or first — pick
  one and be consistent), matching every other card game's convention;
  the handoff doesn't specify a sort and the prototype's flat state
  notes don't imply one either, so this is the implementer's call to
  make explicitly and document, not to leave unsorted.

## Sounds

Reuse existing sounds, no new dependencies:
- Shuffle/deal: `'shuffle'` (already generic, used by every DealIntro
  game).
- Drawing to hand: `'card-draw'`.
- Playing a card onto a building pile, or discarding: `'card-play'`
  (matches Rummy/Phase10's convention of one generic play sound for
  any card leaving a hand/pile onto another zone).
- Playing a Skip-Bo wild card: `'uno-wild'` — explicit user instruction
  to reuse Uno's special-card sound rather than adding a new one.
- Stockpile reaching 0 / winning the game: `'game-win'` (this is a
  single-round game, so "round win" and "game win" are the same event —
  use `'game-win'`, not `'round-win'`, since there's no subsequent round).
- **Flagged, not decided**: a building pile completing (reaching 12 and
  clearing) has no obviously-correct existing sound — it's frequent
  (many times per round, unlike a round/match win) and semantically
  distinct from anything in the current registry. Do NOT silently repurpose
  a thematically-unrelated existing sound (e.g. `'hot-dice'`,
  `'knock'`) for this — implementer should either reuse `'card-play'`
  (i.e., a completed pile clear gets no distinct cue beyond the normal
  play sound) as the safe default, or flag it back to the lead/user
  explicitly if a distinct cue is judged necessary. Recorded here so
  the decision is visible, not buried in an implementer's unilateral
  choice.

## Seats & deck math

2–4 seats (handoff's own number, already deck-math-sound: 162-card
deck, 30-card stockpile × 2 = 60, or 20-card stockpile × up to 4 = 80,
either comfortably under 162 with room for 5-card hands and a live draw
pile). `SKIPBO_MIN_SEATS = 2`, `SKIPBO_MAX_SEATS = 4`.

## Sequencing (mirrors Uno's original net-new charter shape, NOT
Rummy/Phase10's retrofit shape — nothing existing to keep green
mid-flight, so specs land separately)

1. **Card-engine module** (`src/card-games/skipbo/`): `deck.ts`,
   `state.ts`, `rules.ts`, `bot.ts` + tests. Pure logic, no React.
2. **Screens**: `SkipBoCard.tsx`/`.css` (new card-face/back component,
   following `Phase10Card.tsx`'s shape as the closest sibling — numbered
   + wild, not suited), `SkipBoRoom.tsx` (N-seat lobby, mirrors
   `RummyRoom.tsx`), `SkipBoTable.tsx`/`.css`, `SkipBoResults.tsx`
   (single winner announcement + final stockpile-count ranking as a fun
   stat, not a score table; rematch button).
3. **Wiring**: `App.tsx` (lobby/broadcast/`sendTo`/bot-per-seat model,
   mirroring Rummy's `rummyBroadcast`/`startRummyHost`/etc. shape
   exactly), `Landing.tsx` shelf tile, `README.md`.

## Non-goals

No changes to any other game. No new runtime dependencies. No mobile-
specific work beyond what the shared components already handle. No
scores/target/match system — genuinely a single-round game per the
real rules.

## Definition of done

Engine tests at 2, 3, and 4 seats (deal correctness, building-pile
legality/wraparound at 12→1, bot priority loop, stockpile-empty win
detection mid-turn). Live N-player match (host + bots at both 2 and 4
seats) verified visually by the lead — deal intro, opponent tile grid,
building piles, select-then-confirm play, win detection. tsc/tests/
build green throughout. Oscar-or-deepseek review per risk level (engine
correctness reviewed personally; screens/wiring may be delegated if it
closely mirrors Rummy/Phase10's already-proven shape). Landed as 3
separate commits (one per spec), each pushed once verified.
