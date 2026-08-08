# Spec 02 — M2: keep the just-drawn card visually separated until discard

Applies to BOTH `src/screens/RummyTable.tsx` and `src/screens/Phase10Table.tsx`
— same fix, same reasoning, in each file independently (they don't share
code). Read `CLAUDE.md` first — binding. Read both files in full before
editing.

## Files you own
```
src/screens/RummyTable.tsx
src/screens/Phase10Table.tsx
```
Do not touch `RummyTable.css`/`Phase10Table.css`, `PlayingCard.tsx`, or
`Phase10Card.tsx` (a plain inline `style` override is enough here, no new
CSS classes needed). Do not touch any other file. Do not run `git commit`.

## The problem

Both components already track `justDrawn: Card | null` (local `useState`,
set when a single-card draw is detected, cleared on the next turn boundary)
purely to drive the "You drew the X" status-line text. The hand fan itself
is rendered from a `sortedHand` value that always fully re-sorts the WHOLE
hand — including the just-drawn card — so the new card jumps straight into
its sorted position instead of staying visible at the end where the player
physically picked it up. This is confusing during the brief window between
drawing and discarding, when the player is deciding what to do with the new
card.

## The fix — identical shape in both files

Change the `sortedHand` computation so the just-drawn card (if any, and if
still actually in the hand — it won't be after being discarded, but
`justDrawn` is cleared at that point anyway per the existing turn-boundary
effect) is EXCLUDED from the sort and appended at the end instead:

**Rummy** (`RummyTable.tsx`, replacing the existing `sortedHand` useMemo,
currently `useMemo(() => sortHand(hand, sortBy), [hand, sortBy])`):
```ts
const sortedHand = useMemo(() => {
  if (!justDrawn || !hand.some((c) => c.id === justDrawn.id)) {
    return sortHand(hand, sortBy)
  }
  const rest = hand.filter((c) => c.id !== justDrawn.id)
  return [...sortHand(rest, sortBy), justDrawn]
}, [hand, sortBy, justDrawn])
```

**Phase 10** (`Phase10Table.tsx`, replacing the existing `sortedHand`
useMemo, currently `useMemo(() => sortHandForDisplay(hand), [hand])`):
```ts
const sortedHand = useMemo(() => {
  if (!justDrawn || !hand.some((c) => c.id === justDrawn.id)) {
    return sortHandForDisplay(hand)
  }
  const rest = hand.filter((c) => c.id !== justDrawn.id)
  return [...sortHandForDisplay(rest), justDrawn]
}, [hand, justDrawn])
```

Then, in each file's hand-fan render (`.rummy-hand-fan` /
`.p10-hand-fan`), give the LAST card in `sortedHand` extra visual
separation when it's the just-drawn card, instead of the usual tight
overlap margin. Both fans currently render every card (including the
first) with `style={{ marginLeft: i === 0 ? 0 : -26 }}`. Change the
per-card margin logic to a small local helper (or inline conditional) that
adds a real gap before the drawn card:

```ts
const isLast = i === sortedHand.length - 1
const isSeparatedDraw = isLast && justDrawn && card.id === justDrawn.id
const marginLeft = i === 0 ? 0 : isSeparatedDraw ? 16 : -26
```
(`16` is a deliberate positive gap — a visible break in the overlapping fan
— not just "less overlap"; pick this exact value in both files for
consistency between the two games.) Apply `marginLeft` in the existing
`style={{ marginLeft: ... }}` prop, same spot, no other style changes.

## Why this is correct and doesn't need new state

`justDrawn` already has exactly the right lifecycle for this — set on a
genuine single-card draw, cleared on the next turn-number change (i.e.,
once the player discards and the turn advances, or once it becomes the
opponent's turn). No new `useEffect`, `useState`, or lifecycle logic is
needed; this task is purely "read the existing `justDrawn` value in one
more place: the hand-sort/render path, not just the status line."

**Scope note, already decided — do not extend this**: this only needs to
handle the single-card-draw case, matching `justDrawn`'s own existing
detection (`diff === 1` in the effect that sets it). A Rummy multi-card
discard-pile reach-in does not set `justDrawn` today and this change does
not need to make it do so — that's a different, already-distinctly-handled
interaction (the obligated-card auto-select).

## Verification (run yourself before reporting)

```
npx tsc -b --noEmit
npm test
npm run build
```
All clean — no new automated tests required (this reads an existing,
already-correct piece of state in one more place; there's no new logic to
unit test, only a rendering-order change). Do a manual sanity check
yourself: start the dev server, play a turn in each game, draw a single
card from the stock, and confirm in the rendered DOM/screenshot that the
drawn card appears at the right end of the hand with a visible gap before
it, not sorted into the middle — for BOTH games. Describe what you
observed concretely in your report, not just "it works."

Report: files touched, exact command output, what you observed in the
manual check for each game, confirm no `git commit` was run.
