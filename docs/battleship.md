# Battleship

The first non-card game built on the engine core (`src/engine/`), and the
proof that the core generalizes: hidden information here is not a hand of
cards but a board of ships, and the same `HostSession` public/private split
carries it without modification.

## Where things live

```
src/board-games/battleship/
  state.ts              Types, SHIPS, board helpers (shipCellsAt/fits/
                        randomFleet/validFleet/isShipSunk...), session creation
  rules.ts              validateBattleshipAction (PLACE_FLEET, FIRE) +
                        applyBattleshipAction / runBattleshipBotTurn wrappers
  bot.ts                makeBattleshipBotStrategy(rng) — random placement +
                        hunt/target firing
  battleship.test.ts    Module coverage incl. the snapshot no-leak test
  oscar.test.ts         Adversarial review suite (leak + host-authority probes)

src/screens/Battleship{Room,Table,Results,RulesOverlay}.tsx (+ Table.css)
src/assets/battleship/  Ship art (h/v per ship) + markers.png 4-frame sheet
```

App wiring in `src/App.tsx` mirrors Rummy/Phase 10 exactly (bespoke
states/refs/helpers, `BS-` join prefix, three-branch render ladder).

## The hidden-information contract

- Private state per player: their own 100-cell board (`ShipId | null`,
  row-major 10×10).
- Public state: per-player hit/miss grids (`hits`), readiness flags, sunk
  reveals (`sunk[playerId]` = ship id + true cells, appended only when the
  ship is fully hit), scores (= ships sunk), `lastShot` (names a ship ONLY
  on a sink), turn state, stage (`placing | battle | over`), winner.
- The enemy's unsunk positions never exist anywhere a client can see:
  `deriveSnapshot` sends each player only their own private board, and the
  bot targets purely from public `hits` + `sunk` data.
- Placement is client-side (your layout is your secret); the host validates
  the submitted fleet (`validFleet`: exact five ships, straight contiguous
  lines, 17 cells) before accepting. The bot's fleet and targeting use the
  host-side seeded rng (`BattleshipSession.rng`), never `Math.random`.

## Rules (from `Design Handoff/BATTLESHIP.md`)

Classic fleet (5/4/3/3/2), one shot per turn, turn passes on hit or miss,
sinking reveals the ship and scores a point, all five sunk ends the single
match (no rounds, no best-of). Bot: unresolved-hit orthogonal-neighbor
targeting, else uniform random over unfired cells.

## Rule variants (2026-08-09)

Host-selected in the room screen before the match; stored as
`publicState.variant`; rematch reuses the finished match's variant.

- `standard` — "Standard turn-based": turn passes after every shot.
- `streak` — "Make it, take it": hit or sink keeps your turn (`extraTurn`),
  miss passes it. Status appends "Fire again." on your own hits.
- `free` — "Free-for-all": no turns. The validator skips the turn check;
  every accepted shot applies `extraTurn`, making `turnNumber` a pure
  monotonic shot counter (which keeps the per-shot sound signature unique
  and feeds the bot loop's staleness key). The house bot fires every
  `BASE_MS` on a stage-only staleness key — deliberately coarser than the
  turn-based key so human shots can't reset its timer and starve it
  (live-verified defect, fixed in spec 15c).

The bot *strategy* is variant-agnostic; only the App bot-loop gate and the
validator know about modes.

## UI notes

- Two-phase single screen: placement (draft board local to the table,
  tray + rotate (button or spacebar) + randomize-remaining + start) and
  battle (fire on your turn, markers via the 4-frame `markers.png`
  background-position trick, ship art absolutely positioned in %,
  sunk ships at 0.32 opacity, enemy art only after sinking).
- Fleet pills: own row shows true alive/damaged/sunk; enemy row lights up
  only on sink.
- Sounds: `ship-hit` / `ship-miss` / `ship-sunk` on shots (both players
  hear them), `piece-drop` on placing a ship, `game-win` on results.
  The three ship-* files are placeholders (copies of existing sounds)
  pending real assets.

## Verification history (2026-08-09)

Module + UI reviewed adversarially (sonnet), both clean; the module review
left `oscar.test.ts` in the suite. Full host-vs-bot match live-verified in
the browser: placement (manual + randomize), hunt/target bot behavior
observed (it boxed in and sank four ships), sunk reveals, score pills,
results at 5–4, rematch reset. Zero console errors. Known cosmetic limit:
~14px horizontal squeeze at 320px-wide viewports (boards already stack
below 900px; accepted).
