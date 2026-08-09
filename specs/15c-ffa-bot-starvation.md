# Spec 15c: free-for-all bot starvation fix

Defect (live-verified): in free mode, `battleshipActorKey` includes
`turn.turnNumber`, which every accepted shot bumps — including the
HUMAN's. A human shot landing during the bot's `wait(BASE_MS)` makes the
key stale, aborting `runBattleshipBot` before it fires; the reschedule
starts a fresh 900 ms wait. A human clicking faster than ~1/s therefore
starves the bot forever. In standard/streak this key behavior is correct
(the world changing whose turn it is must abort the wait) — do not change
those.

Fix, in `src/App.tsx` only:

```ts
function battleshipActorKey(bs: BattleshipSession): string {
  const ps = bs.session.publicState
  return ps.variant === 'free' ? ps.stage : `${ps.stage}:${ps.turn.turnNumber}`
}
```

In free mode the key is the stage alone: the bot's loop in
`runBattleshipBot` then survives human shots, keeps its cadence (wait →
fire → loop), and still exits when the stage leaves 'battle' or the
session is torn down (`battleshipStale` already handles a null ref).
Note the loop now iterates multiple fires per invocation in free mode —
that is intended; each iteration re-checks stage and outcome.

Verify: `npx tsc -b --noEmit`, `npm test` (523 green), `npm run build`.
Touch nothing else. Report commands + tallies + deviations.
