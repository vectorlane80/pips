# Spec 08 — fix: groups don't remember which phase they were laid for

Adversarial review of the M4a UI found a real defect that traces back to
a genuine gap in the engine's data model, not just a UI bug — fix it at
the root.

## The bug

`Phase10Table.tsx`'s `groupPhaseNumber` tries to infer, from
`phaseIdx`/`hasLaidPhase`/`roundOver` alone, which phase number a laid
group belongs to — because `Phase10Group` (in `state.ts`) doesn't store
its own phase number. This inference is provably ambiguous:
`finishRoundByGoingOut` (`rules.ts`) advances a player who laid via
`Math.min(phaseIdx + 1, 9)` — which produces the SAME result, `9`, for
two different starting points: a player who had `phaseIdx === 8`
(working on Phase 9, advances to 9) and a player who had `phaseIdx ===
9` (working on Phase 10, capped at 9). There is no way to tell these
apart from the post-round state alone — the caption ends up reading
"Phase 10" even when the player actually just completed Phase 9.

## The fix — store the phase number at lay-time, stop inferring it

**`src/card-games/phase10/state.ts`**: add a field to `Phase10Group`:
```ts
export interface Phase10Group {
  type: import('./classify.ts').GroupType
  zone: Zone
  phaseNumber: number   // 1-based — the phase this group was laid FOR, fixed at lay time
}
```

**`src/card-games/phase10/rules.ts`**: in the `LAY_PHASE` handler, where
it currently builds each new group as `{type: group.type, zone}`, add
the phase number, read from the SAME `requirement` the handler already
looked up (`PHASES[publicState.phaseIdx[playerId]]`) — i.e.
`requirement.phase`:
```ts
newGroupsForPlayer.push({ type: group.type, zone, phaseNumber: requirement.phase })
```
This is the phase the player was actually laying for at the moment they
laid it — fixed forever after, immune to any later `phaseIdx`
advancement. Nothing else in `rules.ts` needs to change (`HIT` extends
an existing group's cards, never touches `phaseNumber`).

**`src/screens/Phase10Table.tsx`**: delete the `groupPhaseNumber`
function entirely. Every call site that currently does
`groupPhaseNumber(publicState, opponentId)` / `groupPhaseNumber(publicState,
localPlayerId)` for a caption should instead read the phase number
directly off the specific group being rendered: `group.phaseNumber` (the
group already being mapped over in both the "their groups" and "your
groups" render blocks — each group caption should read `` `Phase
${group.phaseNumber}` `` instead of `` `Phase ${groupPhaseNumber(publicState,
opponentId)}` ``/etc.). This is strictly simpler and fully correct —
no inference, no ambiguity, and each group can even show a DIFFERENT
phase number than another group from the same player laid in an earlier
round (which is exactly correct, since groups reset every round but the
displayed number is now tied to the specific group, not a live
recomputation).

## Required test update

`src/card-games/phase10/phase10.test.ts`: find the existing test(s) that
assert on `LAY_PHASE`'s resulting `groups` (there's at least one covering
the happy path). Add an assertion that the newly created group(s) each
have `phaseNumber` equal to the phase the player was laying (e.g. laying
Phase 1 → both new groups have `phaseNumber: 1`). Also add a small new
test: a player at `phaseIdx: 8` (Phase 9) lays their phase and goes out
this round — assert their group's `phaseNumber === 9` (not 10), directly
proving the bug this fix resolves (previously this exact scenario is
what the UI's now-deleted inference got wrong).

## Verification (run yourself before reporting)

```
npx tsc -b --noEmit
npm test
npm run build
```
All clean. Note: `Phase10Table.tsx` is NOT yours to modify content-wise
beyond the two described changes (delete `groupPhaseNumber`, change the
two caption call sites to `group.phaseNumber`) — do not touch anything
else in that file. Report: exact diff description, command output,
confirm no `git commit` was run, confirm you touched only
`src/card-games/phase10/state.ts`, `src/card-games/phase10/rules.ts`,
`src/card-games/phase10/phase10.test.ts`, and the two described spots in
`src/screens/Phase10Table.tsx`.
