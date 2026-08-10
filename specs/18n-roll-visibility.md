# Spec 18n: every roll visible + purge stale v2 constants from the screen

Two fixes. Modify `src/board-games/wahoo/state.ts`, `rules.ts`,
`wahoo.test.ts` (event-shape assertions only) and
`src/screens/WahooTable.tsx`.

## 1. The auto-pass swallows the roll (user repro: die blank until a
1/6 was rolled)

When ROLL finds no legal move, the single resulting event is
`{ kind: 'pass', by }` — the die value never reaches clients. Change
the pass event to carry it: `{ kind: 'pass'; by: string; die: number }`
(state.ts type + rules.ts emit; update the handful of pass-event
assertions in wahoo.test.ts). In WahooTable's lastEvent effect, treat
'pass' like 'roll' for the die display: `setLastRoll({ die: ev.die,
by: ev.by })` + run the same flicker; keep the knock... (no knock here —
keep the existing 'pass' sound branch if any; pass currently plays
nothing die-related — leave sounds as they are except dice-roll SHOULD
also play on pass since a die was rolled: play('dice-roll') then the
flicker). Status line for pass becomes
"<You/Name> rolled a <die> — no move, passes."

## 2. Stale v2 constants in WahooTable (lines ~93-94, ~106, ~642)

Import LANE_START / OWNER_TRACK_LEN (and friends) from the module and
replace: marble position mapping and destinationHole's
`p <= 51 ? track[trackIndexFor(arm, p)] : homes[arm][p - 52]` becomes
`p <= OWNER_TRACK_LEN - 1 ? track[...] : homes[arm][p - LANE_START]`;
the legend's home count `positions.filter(p => p >= 52)` becomes
`>= LANE_START`. Sweep the file for any remaining 51/52/55 literals in
position logic (comments may stay descriptive but update stale ones).

Verify: npx tsc -b --noEmit; npm test; npm run build.
Forbidden: bot.ts, board.ts geometry, App wiring; git. Report.
