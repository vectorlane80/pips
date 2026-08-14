# Dominoes (All Fives)

The second non-card game on the engine core, and the first consumer of the
item-generic card-engine containers: tiles `{ id: 'a-b', a, b }` flow
through `Zone<DominoTile>`, `shuffleDeck`, and `dealCards` exactly as
cards do, with the boneyard as a host-only zone (rummy-stock pattern,
count public) and hands private.

## Where things live

```
src/board-games/dominoes/
  state.ts          Tiles, createDominoSet, session, endValue/legalArms
  scoring.ts        Standardized All Fives end counting + round scoring
  rules.ts          Validator (PLAY_TILE / DRAW_TILE / PASS /
                    START_NEXT_ROUND) + apply/runBot wrappers
  bot.ts            Deterministic greedy strategy (max immediate score,
                    doubles-first ties; draws when stuck, knocks last)
  layout.ts         Pure snake-board geometry (see below)
  dominoes.test.ts / layout.test.ts / oscar.test.ts

src/screens/Dominoes{Room,Table,Results,RulesOverlay}.tsx (+ Table.css)
App wiring: DM- codes, rummy-pattern bot loop (draw chains run inside one
loop invocation — draws deliberately do not advance the turn), host-side
auto START_NEXT_ROUND after ROUND_PAUSE_MS.
```

## Rules as shipped

Double-six, seven each, All Fives to 150, starter alternates rounds, any
lead; an opening double is a four-way spinner (all sides open at once —
designer's choice). **Draw rule is the common one by user order:** stuck →
draw until playable (a playable draw must be played), knock only on an
empty boneyard; two knocks block the round. Going out banks the
opponent's pips rounded down to fives; blocked rounds bank both hands to
the lighter hand, ties bank nothing.

**Scoring deviates from the prototype deliberately** (flagged in
CHARTER.md, user's "common rules" instruction): a double at any open end
counts both halves (5-5 lead = 10, not the prototype's 20; 3-3 at an end
= 6), and a spinner's unstarted side arms count nothing. All in
`scoring.ts`. Reviewed and approved by the user 2026-08-09 ("scoring is
fine, I prefer yours") — this is the settled rule, not a pending question.

## Snake board

The wire format stores arms as flat `{inner, outer, isDouble}` lists —
geometry is 100% view-side. `layout.ts` lays each arm outward, doubles
crosswise (1 unit of run length), bends 90° pinwheel-style
(right→up, up→left, left→down, down→right) at H_MAX=11 / V_MAX=4 units
with physical-style flush corners (the corner offset uses each tile's
real crosswise half-extent, so doubles landing on a bend meet flush too).
Leg 0 — every arm's first, un-bent run — always uses the plain H_MAX/V_MAX,
byte-identical to the original single-bend board; every bend from leg 1 on
grows the limit immediately (`legLimit`: +`SPIRAL_STEP` units per leg index,
8-bend ceiling), so a long arm spirals outward instead of running off in one
direction. Growing from leg 1 (not leg 2) is what keeps two *different* arms
from colliding: the pinwheel sends right's post-bend run and up's own un-bent
run onto the same axis (and up→left onto left's, left→down onto down's,
down→right onto right's), so without leg 1 also widening, one arm's bend
could land exactly where a neighboring arm's own run already sits — verified
by an 8000-trial fuzz over the realistic ≤27-tile bound (zero overlaps, zero
gaps, across every arm-count split and pairing). `scaleToFit` clamps the
whole board into the fixed pane (min 0.35) — no scrolling, per the design
decision that replaced the prototype's 440px scrolling pane.

## Deal intro & sounds

`DealIntro` is reused with a domino tile-back renderer and its new
`shuffleSound` prop (`'domino-shuffle'`; card games keep the default).
`domino-play` / `domino-draw` / `knock` fire per action for both players;
`round-win` on scored round ends; `game-win` on the results screen.

## Verification history (2026-08-09)

Module review (sonnet, adversarial): approve — no tile ids in public
state by construction, host authority fail-closed, standardized scoring
verified incl. edge cases; 20-probe oscar.test.ts kept in suite. UI
review: approve after one blocking fix (double shuffle-sound layering —
resolved via the DealIntro prop). Live host-vs-bot: deal intro with tile
backs, 0-0 spinner lead, target gating, standardized banking (+15 human,
+20/+25 bot), final-play + go-out stacking (+15+5), automatic round
transition with alternating starter — all observed in the browser; zero
console errors. Draw/knock/block/match-end paths are covered by full
bot-vs-bot match simulations in the suite (live play of a full 150-point
match was impractical in the hidden-pane test environment, whose rAF/timer
throttling also explains the slow round-2 intro observed — an
environment artifact, not an app behavior).
