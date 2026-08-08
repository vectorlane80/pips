# Spec 01 — M1: round-transition visibility (Phase 10)

Read `CLAUDE.md` at the repo root first — binding. Read
`src/screens/RummyTable.tsx` (search `showRoundBanner`) and
`src/screens/RummyTable.css` (search `.rummy-round-banner`) as your pattern
reference for the round banner — Phase 10 needs its own equivalent, adapted
for its own scoring convention (lower is better, no target score). Read
`src/screens/Phase10Table.tsx` and `src/screens/Phase10Table.css` in full
before editing — you're adding to an existing, working file, not writing a
new one.

## Files you own
```
src/screens/Phase10Table.tsx
src/screens/Phase10Table.css
src/App.tsx   (ONLY the ROUND_PAUSE_MS constant — nothing else in this file)
```
Do not touch `RummyTable.tsx`/`.css`, `RummyResults.tsx`, or any other file.
Do not run `git commit`.

## Part 1 — a live, always-visible running score

Right now `Phase10Table.tsx` never shows either player's `publicState.scores`
value anywhere — the only place a score is ever visible is the separate
`Phase10Results` screen at match end. Add a persistent score readout for
BOTH players, visible throughout the round (not just at round-end):

- **Opponent's side**: in the `p10-their-side-left` block (currently just
  the name and "`{opponentHandCount} cards · hidden`" line), add a third
  line showing their score: `{publicState.scores[opponentId] ?? 0} pts`.
  Style it consistently with the existing `p10-their-count` line (same
  font-size/weight as that sibling, muted color) — add a `.p10-their-score`
  CSS class mirroring `.p10-their-count`'s existing rules.
- **Your side**: near the existing "Phase N — requirement" pill
  (`p10-phase-pill`, in the `p10-your-band` block), add a sibling element
  showing your own score: `Your score: {publicState.scores[localPlayerId]
  ?? 0}`. Reuse the pill's visual weight (a small rounded chip) — add a
  `.p10-score-pill` class, similar padding/border/font-size to
  `.p10-phase-pill` but a neutral color (not violet, to avoid implying it's
  the same kind of information as the phase pill) — e.g. `background:
  var(--surface); border: 2px solid var(--grey-border); color:
  var(--muted-text)`.

Both readouts must update live as `publicState.scores` changes (they're
just reading a prop, so this is automatic — no new state needed).

## Part 2 — a round-over banner

Mirror `RummyTable.tsx`'s `showRoundBanner`/`.rummy-round-banner` pattern
exactly in structure, adapted for Phase 10:

```tsx
const showRoundBanner = publicState.roundOver && !publicState.matchWinnerId
```
(Phase 10 doesn't need the `roundWinnerId` truthiness check Rummy's
version has — Phase 10's blocked-round case, where `roundWinnerId` is
`null`, still needs a banner, just different copy — see below.)

Render it in the centre band, same position/priority as Rummy's (a
full-width row above the stock/discard row):

```tsx
{showRoundBanner && (
  <div className="p10-round-banner">
    {publicState.roundWinnerId === null ? (
      'Round blocked — no cards left to draw. Dealing a new round…'
    ) : (
      <>
        {publicState.roundWinnerId === localPlayerId ? 'You' : opponentName}
        {' went out! '}
        {localName /* NOTE: read the actual prop name Phase10TableProps uses for the local player's display name — it's already a prop, just confirm it before using it here */}
        {': '}{publicState.scores[localPlayerId] ?? 0}{' pts · '}
        {opponentName}{': '}{publicState.scores[opponentId] ?? 0}{' pts. '}
        {'Next round starts automatically.'}
      </>
    )}
  </div>
)}
```
Write this as clean, readable JSX (the above is pseudocode showing the
required CONTENT, not literal code to paste verbatim — structure it however
reads cleanly, e.g. compute the banner text as a plain string via a small
helper function, same as `computeStatus` already does for the status line,
rather than inline JSX fragments if that's cleaner). The required content,
exactly:
- Blocked round (`roundWinnerId === null`): a message saying the round was
  blocked / no cards left to draw and a new round is starting.
- Normal round end: who went out ("You" or the opponent's name), then both
  players' current scores by name, then a note that the next round starts
  automatically. Match Rummy's convention of stating CUMULATIVE score, not
  the round's point delta.

CSS: add `.p10-round-banner` to `Phase10Table.css`, copying
`RummyTable.css`'s `.rummy-round-banner` rule set verbatim (same
`flex: 0 0 100%`, yellow background, ink text/border, pill shape,
margin-bottom) — the comment in that file explaining WHY it's a full-width
row (not absolutely centered) applies identically here, keep it.

## Part 3 — longer pause

In `src/App.tsx`, change:
```ts
const ROUND_PAUSE_MS = 2400
```
to:
```ts
const ROUND_PAUSE_MS = 4000
```
This is a single shared constant used by Tic-Tac-Toe's round-advance pause,
Rummy's round transition, and Phase 10's round transition — the longer
pause benefits all three (nothing about a longer pause is Phase-10-specific
or harmful to the others), so this one change is sufficient; do not
duplicate the constant per-game. Do not touch anything else in `App.tsx`.

## Verification (run yourself before reporting)

```
npx tsc -b --noEmit
npm test
npm run build
```
All clean — no new tests required (this is presentational, reading existing
`publicState` fields that are already correct and already tested). Also do
a manual sanity check: temporarily log or eyeball that
`Phase10TableProps`'s actual prop name for the local player's display name
matches what you used in the banner (it's `localName` per the existing
props interface — confirm, don't guess).

Report: files touched, exact command output, the exact banner copy you
wrote for both the normal and blocked cases, confirm no `git commit` was
run.
