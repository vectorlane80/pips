# Spec 01 — shared score-pill header row (Rummy + Phase 10)

Read `CLAUDE.md` at the repo root first — binding. There is no written
design doc for this — it's built directly from two reference screenshots
the user provided (described precisely below), same approach as the
recent ladder-shape fix. Read `src/screens/RummyTable.tsx`/`.css` and
`src/screens/Phase10Table.tsx`/`.css` in full before editing — you're
modifying existing, working files.

## What the reference shows

In the header row of both tables, immediately after the peer-connection
text ("peer to peer with {opponentName}"), two rounded pill badges
followed by a short hint:
- A pill reading `● You {score}` — a small colored dot, then "You", then
  the number, all bold.
- A pill reading `● {opponentName} {score}` — same shape, the opponent's
  color dot and name.
- A short muted hint string after the two pills: for Phase 10, the literal
  text `"lower wins"`; for Rummy, `"to {target}"` (e.g. "to 100").

Pill visual style (read off the reference image): white/surface
background, a bold `3px solid var(--ink)` border, fully rounded
(`border-radius: 999px`), `padding: 8px 16px`-ish, the dot ~10px, name and
number both bold (~15px). This is a NEW, more prominent pill style than
this codebase's existing thin-border `.chip`/`.p10-phase-pill` —
deliberately bolder to read as a scoreboard, not a status chip.

## Files you own
```
src/components/ScoreHeader.tsx
src/components/ScoreHeader.css
src/screens/RummyTable.tsx
src/screens/RummyTable.css
src/screens/Phase10Table.tsx
src/screens/Phase10Table.css
```
Do not touch any other file. Do not run `git commit`.

## Part 1 — shared `ScoreHeader` component

```tsx
export interface ScoreHeaderProps {
  youScore: number
  youColor: string
  opponentName: string
  opponentScore: number
  opponentColor: string
  hint: string
}

export function ScoreHeader({ youScore, youColor, opponentName, opponentScore, opponentColor, hint }: ScoreHeaderProps): JSX.Element
```
Renders, in a `display:flex; align-items:center; gap` row (a new
`.score-header` wrapper class in `ScoreHeader.css`):
1. A pill (new `.score-header-pill` class) with a colored dot
   (`style={{background: youColor}}`) then the literal text `You` then
   `youScore`.
2. A second `.score-header-pill` with a dot in `opponentColor`, then
   `opponentName`, then `opponentScore`.
3. A muted hint `<span>` (new `.score-header-hint` class, small muted
   text color, e.g. `var(--muted-text)`) rendering `hint` verbatim.

This component is purely presentational — it doesn't know which game it's
in, doesn't compute the hint text, doesn't know about `publicState`. Both
callers pass already-resolved primitives.

## Part 2 — wire into `RummyTable.tsx` (this game currently shows NO live
score anywhere on the table — only at match end on `RummyResults`)

In the header, after the existing `.rummy-peer-strip` span and before
`.rummy-header-actions`, add:
```tsx
<ScoreHeader
  youScore={publicState.scores[localPlayerId] ?? 0}
  youColor="var(--green-text)"
  opponentName={opponentName}
  opponentScore={publicState.scores[opponentId] ?? 0}
  opponentColor={opponentColor}
  hint={`to ${publicState.target}`}
/>
```
Use Rummy's OWN already-established color convention — `var(--green-text)`
for the local player, the existing `opponentColor` prop (already `var(--violet)`
for every Rummy caller) for the opponent — the SAME pairing already used
everywhere else in this file (meld coloring, name labels) and in
`RummyResults.tsx`. Do not introduce a different color scheme than what
this game already uses consistently elsewhere — the reference screenshot's
exact dot colors are illustrative, not a literal color spec to copy over
an already-consistent existing scheme.

`opponentId` needs to be available at the point you add this — confirm
it's already computed earlier in the component (it almost certainly is,
used for other opponent-scoped rendering) before adding a second
computation; reuse the existing variable, don't duplicate the lookup.

Import `ScoreHeader` from `../components/ScoreHeader`.

## Part 3 — wire into `Phase10Table.tsx`, and REMOVE the old score pill

Currently `Phase10Table.tsx` shows the local player's score via a
`.p10-score-pill` ("Your score: N") rendered near the phase pill
(`p10-phase-pill`) in the `p10-your-band` area, and the opponent's score
via a `.p10-their-score` line under the opponent's name. **Remove both**
— the header `ScoreHeader` replaces them entirely; there should be no
score number visible on the table outside the new header row. Also
remove the now-unused `.p10-score-pill`/`.p10-their-score` CSS rules from
`Phase10Table.css` if nothing else references them (confirm before
deleting).

In the header, after `.p10-peer-strip` and before `.p10-header-actions`:
```tsx
<ScoreHeader
  youScore={publicState.scores[localPlayerId] ?? 0}
  youColor="var(--violet)"
  opponentName={opponentName}
  opponentScore={publicState.scores[opponentId] ?? 0}
  opponentColor={opponentColor}
  hint="lower wins"
/>
```
Phase 10's own established scheme (violet = you, matching the ladder's
"you" dot and the phase pill's violet dot; `opponentColor` prop = the
game's opponent color, already green `#1aa06d` for the real caller) —
same reasoning as Rummy: reuse what's already consistent in this file,
don't invent a third scheme. `hint` is the literal string `"lower wins"`
— Phase 10 has no numeric target, unlike Rummy.

## Verification (run yourself before reporting)

```
npx tsc -b --noEmit
npm test
npm run build
```
All clean — no new tests required (purely presentational, reading
already-correct, already-tested `publicState.scores`/`target` values).
Do a manual sanity check: confirm `RummyPublicState` really has a
`target: number` field (it does — `state.ts`) and that Phase 10's
`Phase10PublicState` genuinely has no equivalent (it doesn't — confirm
before assuming, don't invent a field).

Report: files created/modified, exact command output, confirm the old
Phase 10 score pill/line were fully removed (not just visually hidden),
confirm no `git commit` was run.
