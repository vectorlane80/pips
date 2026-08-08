# Spec 07 — fix: undetected blocked round when the lone discard card is a Skip

Adversarial review of the M1 bot found a real defect, traced to a gap in
the already-committed `src/card-games/phase10/rules.ts` — fix it there
(the correct fix point), not in the bot.

## The bug

In `rules.ts`'s `DRAW_FROM_STOCK` handler, when the stock is empty:
- If `discardPile` has ≥2 cards, it recycles (keeping the top card) —
  fine.
- If `discardPile` has exactly 0 cards, the round is correctly marked
  blocked (`roundOver: true, roundWinnerId: null`).
- If `discardPile` has exactly 1 card, the code currently assumes the
  player can just draw that card via `DRAW_FROM_DISCARD` instead, and
  rejects `DRAW_FROM_STOCK` with `'stock is empty — draw from the
  discard pile instead'`.

That assumption is wrong when the lone discard card is a Skip: Skip
cards can never be drawn from the discard pile (`DRAW_FROM_DISCARD`
rejects it). So in the specific state **stock empty, discard pile has
exactly 1 card, and that card is a Skip**, the acting player has NO
legal action at all — `DRAW_FROM_STOCK` is rejected telling them to use
`DRAW_FROM_DISCARD`, and `DRAW_FROM_DISCARD` is rejected because it's a
Skip. This is a genuine soft-lock reachable by a real human player, not
just a bot quirk — the M1 bot review caught it by testing the bot, but
it's an engine correctness gap.

## The fix

In `src/card-games/phase10/rules.ts`, inside the `DRAW_FROM_STOCK`
handler's stock-empty branch, change the condition that currently reads
(approximately) `if (cardCount(publicState.discardPile) === 0)` to also
treat a lone Skip card as blocked:

```ts
const discardCount = cardCount(publicState.discardPile)
const lonelySkip = discardCount === 1 && topCard(publicState.discardPile)?.meta?.kind === 'skip'
if (discardCount === 0 || lonelySkip) {
  return {
    ok: true,
    publicState: { ...publicState, roundOver: true, roundWinnerId: null },
    privateStates,
  }
}
```
(Adjust variable names to match the surrounding code's actual style —
this is the logic, not a literal patch; keep it a minimal, targeted
change to that one branch, don't restructure the surrounding function.)
The final fallback (`discardCount === 1` and that card is NOT a Skip)
keeps its existing behavior: reject `DRAW_FROM_STOCK`, tell the player to
draw from discard instead — that path is still fully legal.

## Required new test (in `phase10.test.ts`, alongside the existing
blocked-round test)

Construct a session (by hand, same technique the existing blocked-round
test and other hand-built fixtures in that file use) with: stock empty,
discard pile containing exactly one Skip card, and it's the acting
player's draw phase. Call `applyPhase10Action(game, playerId, {type:
'DRAW_FROM_STOCK'})`. Assert:
- `outcome.ok === true`
- `outcome.publicState.roundOver === true`
- `outcome.publicState.roundWinnerId === null`
- No score or `phaseIdx` change occurred for either player (same
  assertion style as the existing "blocked round: no score/phaseIdx
  change" test).

Also add: `applyPhase10Action(game, playerId, {type:
'DRAW_FROM_DISCARD'})` on that same starting state is still correctly
rejected (`outcome.ok === false`) — confirms the fix didn't accidentally
make the Skip drawable.

## Second, smaller fix — test hardening in `bot.test.ts`

Two existing HIT tests only assert the bot's returned action shape via
`toEqual`, without running it through `runPhase10BotTurn`/the real
validator (unlike their sibling tests, which do both):
- `'discard phase, already laid: hits a hand card onto the opponent's group'`
- `'validates a hit against the full group including prior hits'`

Add, to both, the same pattern their sibling test already uses: call
`runPhase10BotTurn(game, 'p1', phase10BotStrategy)` and assert
`result.outcome.ok === true` — in addition to the existing shape
assertion, not instead of it.

## Verification (run yourself before reporting)

```
npx tsc -b --noEmit
npm test
npm run build
```
All clean. Report: exact diff description (should be small — one
targeted change in `rules.ts` plus new/hardened tests in
`phase10.test.ts` and `bot.test.ts`), exact command output, confirm no
`git commit` was run, confirm you touched only
`src/card-games/phase10/rules.ts`, `src/card-games/phase10/phase10.test.ts`,
and `src/card-games/phase10/bot.test.ts`.
