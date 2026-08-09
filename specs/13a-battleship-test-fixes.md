# Spec 13a: fix two test-harness bugs in battleship.test.ts

Two tests in `src/board-games/battleship/battleship.test.ts` fail because the
TESTS are wrong, not the module. Fix exactly these, then delete the leftover
`src/board-games/battleship/debug.test.ts`. Touch nothing else.

## Fix 1 — "respects base and alreadyPlaced"

The test passes `fleetA()` (a FULL five-ship fleet) as `base` while listing
only `['carrier', 'battleship']` as already placed, so randomFleet correctly
re-adds cruiser/submarine/destroyer on top of their existing cells → invalid
fleet. The base must contain ONLY the already-placed ships. Replace the base
construction with:

```ts
const base = emptyBoard()
place(base, 'carrier', [0, 1, 2, 3, 4])
place(base, 'battleship', [20, 21, 22, 23])
const result = randomFleet(createRng(2), base, ['carrier', 'battleship'])
```

Keep all existing assertions (validFleet true; cells 0–4 and 20–23 unchanged
from base; per-ship cell counts 5/4/3/3/2).

## Fix 2 — "full bot-vs-bot match"

The loop drives placement by `currentPlayer`, but placement is not
turn-ordered: after p1 places, the turn pointer still says p1 (by design),
so the harness asks p1 to place twice and the validator rightly rejects it.
Place both fleets explicitly, then drive the battle by turn. Replace the
loop body with:

```ts
let bs = createBattleshipGame(['p1', 'p2'], 7)
const strategyP1 = makeBattleshipBotStrategy(createRng(11))
const strategyP2 = makeBattleshipBotStrategy(createRng(23))
for (const playerId of ['p1', 'p2'] as const) {
  const result = runBattleshipBotTurn(bs, playerId, playerId === 'p1' ? strategyP1 : strategyP2)
  expect(result.outcome.ok).toBe(true)
  bs = result.bs
}
expect(bs.session.publicState.stage).toBe('battle')
let shots = 0
while (bs.session.publicState.stage !== 'over') {
  const playerId = currentPlayer(bs.session.publicState.turn)
  const result = runBattleshipBotTurn(bs, playerId, playerId === 'p1' ? strategyP1 : strategyP2)
  expect(result.outcome.ok).toBe(true)
  bs = result.bs
  shots++
  expect(shots).toBeLessThanOrEqual(200)
}
```

Keep the final winner/score assertions unchanged.

## Then

Delete `src/board-games/battleship/debug.test.ts` entirely.

Verify: `npx tsc -b --noEmit` clean; `npm test` fully green (expect 26 test
files, 507 tests, 0 failures — the debug file's tests disappear).

Forbidden: changing `state.ts`, `rules.ts`, `bot.ts`, or any file outside
the two named test files. Report commands + verbatim tallies + deviations.
