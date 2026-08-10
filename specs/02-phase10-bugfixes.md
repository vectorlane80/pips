# Spec 02 — three Phase 10 bugs

Read `CLAUDE.md` at the repo root first — binding. Read every file listed
below in full before editing any of them — you're modifying existing,
working files, not writing from scratch. All three bugs and their fixes are
fully decided here; do not redesign, only implement exactly as specified.

## Files you own

```
src/card-games/phase10/classify.ts
src/card-games/phase10/classify.test.ts
src/card-games/phase10/rules.ts
src/card-games/phase10/state.ts
src/card-games/phase10/bot.ts
src/card-games/phase10/bot.test.ts
src/card-games/phase10/phase10.test.ts
src/screens/Phase10Table.tsx
docs/phase10.md
```
Do not touch any other file. Do not run `git commit`.

---

## Bug 1 — wild cards land in random/shifting positions within a laid run or color group

### Root cause

`src/screens/Phase10Table.tsx`'s `sortGroupForDisplay` sorts run/color groups
with `Number(a.rank) - Number(b.rank)`. A Wild card's `rank` is the literal
string `'WILD'` (see `deck.ts`) — `Number('WILD')` is `NaN`. A comparator that
returns `NaN` is not a valid total order; `Array.prototype.sort` behavior in
that case is implementation-defined, so a Wild's position is effectively
undefined — it can land anywhere, and can differ between renders of the exact
same card set. This is both "wild in the wrong place" and "cards shift after
being laid" — same root cause, one fix.

### Fix

Add two new pure, exported functions to `classify.ts` (they belong there,
not in the screen — they operate on `Card[]`/`GroupType` domain logic, are
unit-testable without a DOM, and `classify.ts` already owns the
run/set/color validity logic they're the display-ordering counterpart of):

```ts
// Orders a valid run's cards for display: naturals ascending by rank, with
// each Wild placed at the exact gap position it fills. Wilds beyond what's
// needed to fill internal gaps are pure range-extensions with no single
// correct side — split them deterministically, floor(extra/2) before the
// naturals and the rest after. Deterministic and stable: the same card set
// always produces the same order, unlike the broken NaN-comparator sort it
// replaces.
export function orderRunForDisplay(cards: Card[]): Card[] {
  const naturals = cards.filter((c) => c.meta?.kind === 'number').sort((a, b) => Number(a.rank) - Number(b.rank))
  const wilds = cards.filter((c) => c.meta?.kind !== 'number')
  if (naturals.length === 0) return wilds
  const minNum = Number(naturals[0].rank)
  const maxNum = Number(naturals[naturals.length - 1].rank)
  const byValue = new Map(naturals.map((c) => [Number(c.rank), c]))
  const filled: Card[] = []
  let wildIdx = 0
  for (let v = minNum; v <= maxNum; v++) {
    const natural = byValue.get(v)
    filled.push(natural ?? wilds[wildIdx++])
  }
  const extra = wilds.slice(wildIdx)
  const before = Math.floor(extra.length / 2)
  return [...extra.slice(0, before), ...filled, ...extra.slice(before)]
}

// Orders a valid color group's cards for display: naturals ascending by
// rank, then any Wilds appended at the end. A color group has no run
// semantic (no "gap" a Wild fills), so this is simpler than orderRunForDisplay
// — just deterministic instead of NaN-driven.
export function orderColorGroupForDisplay(cards: Card[]): Card[] {
  const naturals = cards.filter((c) => c.meta?.kind === 'number').sort((a, b) => Number(a.rank) - Number(b.rank))
  const wilds = cards.filter((c) => c.meta?.kind !== 'number')
  return [...naturals, ...wilds]
}
```

In `Phase10Table.tsx`, import both and rewrite `sortGroupForDisplay`:

```ts
function sortGroupForDisplay(cards: Card[], type: GroupType): Card[] {
  if (type === 'set') {
    return [...cards].sort((a, b) => (COLOR_ORDER[a.suit] ?? 4) - (COLOR_ORDER[b.suit] ?? 4))
  }
  if (type === 'run') return orderRunForDisplay(cards)
  return orderColorGroupForDisplay(cards)
}
```
(The `'set'` branch is untouched — sorting by `COLOR_ORDER` already handles
Wilds correctly, since `COLOR_ORDER` has an explicit `special: 4` entry, no
`Number(rank)` involved.)

### Tests to add (`classify.test.ts`)

For `orderRunForDisplay`:
- An internal gap: naturals `[7, 9]` (green) + one Wild → result is
  `[7, WILD, 9]` (Wild at the gap, index 1).
- A pure end-extension: naturals `[5, 6, 7]` + one Wild, run length 4 → the
  Wild has no gap to fill (span already equals natural count) — result is
  `[WILD, 5, 6, 7]` (before) since `Math.floor(1/2) === 0` puts the single
  extra Wild after... **compute this carefully and assert exactly what your
  implementation produces** — don't hand-copy this example number without
  tracing the code, `before = Math.floor(extra.length / 2)` with
  `extra.length === 1` gives `before = 0`, so the single extra wild goes
  in the AFTER slice, i.e. result is `[5, 6, 7, WILD]`. Verify by tracing,
  then assert the traced result.
- Two gaps, two Wilds, no extension: naturals `[2, 5]` + two Wilds, run of 4
  → `[2, WILD, WILD, 5]`.
- All-Wild run (e.g. 3 Wilds forming a run of 3): naturals is empty, function
  returns `wilds` unchanged (order among identical Wild cards is irrelevant).

For `orderColorGroupForDisplay`:
- Naturals `[9, 3]` (unsorted input) + one Wild → `[3, 9, WILD]`.

Run `npx tsc -b --noEmit` mentally against your own test file before
finishing — get the exact expected arrays right by tracing the algorithm,
not by guessing.

---

## Bug 2 — discarding a second Skip card in the same round doesn't skip the opponent

### Root cause

This is a real correctness bug, not a UI issue: `rules.ts`, `state.ts`, and
`bot.ts` implement an invented house rule — "only the first Skip a player
discards each round actually skips the opponent; a second one just discards
normally" (see `skipUsed` in `state.ts`, `docs/phase10.md`'s existing
"known deviation" note, and `rules.ts` line ~325). **Official Phase 10 rules
have no such cap** — this project's own rules research
(`docs/phase10.md`) never asked for one; it appears to have been invented
during implementation. Every discarded Skip card skips the next player,
full stop, no matter how many Skips a player discards in one round. Remove
the cap entirely rather than "fixing" it into a different invented rule
(the user's own suggested alternative — blocking the second discard — is
also not the real rule; don't implement it).

### Fix

**`state.ts`**: remove the `skipUsed: Record<string, boolean>` field from
`Phase10PublicState` (and its doc comment), and remove
`skipUsed: { [playerIds[0]]: false, [playerIds[1]]: false },` from
`createPhase10Game`'s initial `publicState`.

**`rules.ts`**:
- In the `START_NEXT_ROUND` branch, remove the
  `skipUsed: { [nextOrder[0]]: false, [nextOrder[1]]: false },` line from the
  returned `publicState`.
- In the `DISCARD_CARD` branch, change:
  ```ts
  const discarded = newDiscard.cards[newDiscard.cards.length - 1]
  const skipApplied = discarded.meta?.kind === 'skip' && !publicState.skipUsed[playerId]
  return {
    ok: true,
    publicState: {
      ...publicState,
      turn: skipApplied ? skipNext(publicState.turn, 'draw') : advanceTurn(publicState.turn, 'draw'),
      discardPile: newDiscard,
      ...(skipApplied ? { skipUsed: { ...publicState.skipUsed, [playerId]: true } } : {}),
      handCounts: { ...publicState.handCounts, [playerId]: cardCount(newHand) },
    },
    privateStates: { ...privateStates, [playerId]: { hand: newHand } },
  }
  ```
  to:
  ```ts
  const discarded = newDiscard.cards[newDiscard.cards.length - 1]
  const skipApplied = discarded.meta?.kind === 'skip'
  return {
    ok: true,
    publicState: {
      ...publicState,
      turn: skipApplied ? skipNext(publicState.turn, 'draw') : advanceTurn(publicState.turn, 'draw'),
      discardPile: newDiscard,
      handCounts: { ...publicState.handCounts, [playerId]: cardCount(newHand) },
    },
    privateStates: { ...privateStates, [playerId]: { hand: newHand } },
  }
  ```
- Update the comment above the `DISCARD_CARD` skip-handling block (currently
  explains the once-per-round cap) to instead say: every discarded Skip
  skips the opponent's turn — in this 2-player game `skipNext` moves the
  index by 2, which lands back on the SAME player, giving them another turn.

**`bot.ts`**: in `selectDiscard`, change:
```ts
const skip = hand.find((c) => c.meta?.kind === 'skip')
if (skip && !publicState.skipUsed[playerId]) return skip.id
```
to:
```ts
const skip = hand.find((c) => c.meta?.kind === 'skip')
if (skip) return skip.id
```
(`publicState` and `playerId` params of `selectDiscard` may become partially
unused by this change — check whether either is still referenced elsewhere
in the function before removing it from the signature; `playerId` is likely
now fully unused and should be removed from the signature and all call
sites if so, `publicState` is still used elsewhere in the function so keep
it.)

**Tests**: `bot.test.ts` and `phase10.test.ts` both reference `skipUsed` —
update or remove every reference so they assert the new (correct) behavior:
a second Skip discarded in the same round still skips the opponent, and the
bot always discards a Skip in hand as its tempo play regardless of how many
it's already discarded this round. Don't just delete assertions to make
tests pass — rewrite them to actually verify the fixed behavior (e.g. a test
that discards two Skips in a row for the same player and asserts the turn
stayed with that player both times, or that `pub.skipUsed` no longer exists
as a field at all by checking the type doesn't include it — TypeScript will
already catch any leftover `.skipUsed` reference as a compile error, which
is your signal to have removed every one).

**`docs/phase10.md`**: find the section documenting the `skipUsed` cap as a
known/intentional deviation (search for "skipUsed" and "at one skip") and
correct it — either remove the note entirely (since there's no longer a
deviation to document) or replace it with a short line noting the cap was
found to be a bug (not a real Phase 10 rule) and removed. Keep this concise,
matching the existing devlog/doc tone — don't pad it.

---

## Bug 3 — no sound plays when it becomes the human player's turn

### Root cause

Neither `Phase10Table.tsx` nor `RummyTable.tsx` has ever had a turn-start
notification sound — the existing sound effect in `Phase10Table.tsx` (the
`useEffect` around the `soundSigRef` ref) only fires sounds attributable to
the LOCAL player's own actions (gated on `if (p.wasMyTurn)`), and nothing
plays when the opponent's turn ends and control passes back to the human.
This fix is Phase 10 only — the user reported it for Phase 10 specifically;
do not touch `RummyTable.tsx`.

### Fix

Reuse the existing `'die-select'` sound asset (already in `SoundName` /
`SOUND_FILES` in `src/hooks/useSound.ts` — do not add a new sound file or
`SoundName` entry) as the turn-start cue. It's a short, neutral sound
currently unused by either card game, appropriate for a lightweight
notification chime.

In the same `useEffect` in `Phase10Table.tsx` that already reads
`soundSigRef.current` (the one starting `const p = soundSigRef.current`),
add a check for the opponent-to-me turn transition. Add it as an `if`
alongside (not nested inside) the existing `if (p.wasMyTurn) { ... }` block,
since it needs to fire in the opposite case:

```ts
if (!p.wasMyTurn && isMyTurn && !publicState.roundOver) {
  play('die-select')
}
```
Place this new `if` immediately after the existing `if (p.wasMyTurn) { ... }`
block, before the round-win/notice checks. The `!publicState.roundOver`
guard prevents it firing on a round-blocked state (where "your turn" isn't a
meaningful signal). Because `soundSigRef.current` is initialized from the
CURRENT `isMyTurn` value on mount (see the `useRef({ ..., wasMyTurn: isMyTurn })`
initializer, unchanged by this fix), this will never fire spuriously on
first mount — only on a genuine false→true transition during play.

No test needed for this (it's a `play()` side-effect call, same as the
existing sound branches, which also have no automated test — this codebase
has no jsdom/testing-library, so this class of behavior is verified live in
browser, not via vitest).

---

## Verification (run yourself before reporting)

```
npx tsc -b --noEmit
npm test
npm run build
```
All clean. `npm test` must show a HIGHER test count than before (new
`orderRunForDisplay`/`orderColorGroupForDisplay` tests), and must not show
any test still asserting the old capped-skip behavior.

Report: exact command output, a list of every place `skipUsed` was removed
(confirm zero remaining references via a final `grep -rn skipUsed src` you
run yourself — must be empty), and confirm no `git commit` was run.
