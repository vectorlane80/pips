# Spec 31 — Farkle: fix the missed final-round bug, clarify scoring text

Two independent fixes from user reports. Do both.

## Fix 1 — REAL BUG: the game doesn't end if a farkle happens during the final lap

`src/state/room.ts`

Once a player crosses `winningScore` (10,000) by banking, `farkleBank` sets
`finalRound = true` and `finalTrigger = <that player's seat id>`. The match
is supposed to end the moment play comes back around to that same seat
(everyone else gets exactly one more turn). Look at `farkleBank` (~line
234-259): after computing the new `turnIdx`, it checks
`if (finalRound && state.seats[turnIdx]?.id === finalTrigger)` and, if so,
ends the game and goes to `screen: 'results'`.

**The bug**: `farkleEndTurn` (~line 261-266, the bust/pass path — fired
when a player farkles, per the just-shipped auto-advance-after-bust
feature) advances `turnIdx` the exact same way but NEVER runs that
end-of-final-round check. So if ANY player farkles instead of banking
during the final lap, the "did we get back around to the trigger seat"
check is silently skipped for that turn transition, and the match just
keeps going — potentially for many extra rounds, however long it takes
for the exact right sequence of BANK (not farkle) actions to happen to
land turnIdx back on the trigger seat. This exactly matches the reported
bug: a player already well past 10,000, ten rounds in, game still running.

Fix: extract the shared "check whether the final lap just completed, and
if so end the game" logic into one function both `farkleBank` and
`farkleEndTurn` call after computing their new `turnIdx`, e.g.:

```ts
// Ends the match if the final lap just completed (turn arrived back at the
// seat that first crossed the winning score). Shared by every farkle
// action that can advance the turn — a bust must trigger this exactly
// like a bank does, or a farkle during the final lap silently skips it.
function checkFarkleMatchEnd(
  seats: RoomState['seats'],
  turnIdx: number,
  finalRound: boolean,
  finalTrigger: string | null,
): { winnerId: string } | null {
  if (!finalRound || seats[turnIdx]?.id !== finalTrigger) return null
  const winnerId = [...seats].sort((a, b) => b.score - a.score)[0].id
  return { winnerId }
}
```

Call it from `farkleBank` (using its freshly-computed `seats` with the
new score) exactly where the inline check currently is, and from
`farkleEndTurn` (using `state.seats`, unchanged — a bust never changes
score) after its `advanceTurn` call, adding the same `screen: 'results'`
branch `farkleEndTurn` currently lacks entirely (right now it has no
game-end path at all — verify this and add one).

**Test it**: add to `src/state/room.test.ts` — build a room where a
player has already banked past `winningScore` (`finalRound: true,
finalTrigger: <that seat's id>`), advance to another seat's turn, and
send `farkleEndTurn` for THAT seat (simulating a bust during the final
lap) when it's the LAST seat before turn returns to the trigger seat —
assert the resulting state has `screen === 'results'` and a correct
`winnerId`. Also add the inverse sanity check: same setup but the seat
whose turn it becomes next is NOT the trigger seat — assert the game
does NOT end (`screen` stays `'farkle'`) after that seat's `farkleEndTurn`.

## Fix 2 — CLARITY: the four/five/six-of-a-kind rule rows are ambiguous

`src/data/rules.ts`, the `farkle.scoring` array. Current rows:

```
{ label: 'Four of a kind', value: '× 2' },
{ label: 'Five of a kind', value: '× 4' },
{ label: 'Six of a kind', value: '× 8' },
```

A user correctly found this unclear — "× 2" of *what* isn't obvious
without cross-referencing the "three of a kind" rows above it, and the
actual rule (each die beyond the third DOUBLES the three-of-a-kind value,
so four 1s = 1,000 × 2 = 2,000, not "3-of-a-kind value ×2 of the die
count" or some other reading). Make each row self-explanatory with a
worked example baked into the label or value, e.g.:

```
{ label: 'Four of a kind', value: 'double the triple (four 1s = 2,000)' },
{ label: 'Five of a kind', value: '×4 the triple (five 1s = 4,000)' },
{ label: 'Six of a kind', value: '×8 the triple (six 1s = 8,000)' },
```

Word it however reads cleanest in the existing label/value column
layout — the goal is that a player reading just that one row understands
the rule without needing the row above it. Don't change any other rule
row or any other game's rules content in this file.

## Verify before reporting

`npx tsc -b --noEmit` silent; `npm test` all green (report the new total
— should grow by however many tests you added in Fix 1, currently 821).
Report both diffs and verbatim outputs.
