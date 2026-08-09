# Spec 17e: Dominoes App + Landing wiring (M3 part 2)

Wire the dominoes module + screens into the app. Modify ONLY
`src/App.tsx` and `src/screens/Landing.tsx`. The pattern is the existing
Rummy wiring (its fourth sibling). Write all edits first, verify once.

Differences from Rummy to hold onto:
- Actions: `onPlayTile` / `onDraw` / `onPass`; host-side auto
  `START_NEXT_ROUND` after ROUND_PAUSE_MS when stage 'roundEnd' with no
  matchWinnerId (Rummy's round-transition effect, adapted: gate on
  `publicState.stage === 'roundEnd' && !publicState.matchWinnerId`).
- Match over when `stage === 'over' && matchWinnerId`.
- The bot acts multiple times within one turn (draw chains — draws do
  NOT advance the turn), which the rummy-style inner loop already
  supports: keep looping while the actor key is unchanged; re-check
  `stage === 'play' && currentPlayer(ps.turn) === 'bot'` each iteration;
  actor key = `` `${ps.roundNumber}:${ps.turn.turnNumber}` `` — a draw
  keeps the key (loop continues, next action after BASE_MS), a play
  advances the turn → stale → exit; ALSO include `ps.stage` in the key so
  round transitions abort the loop.

## App.tsx (each item copies the rummy twin; place beside the
battleship/phase10 blocks)

1. Imports: `createDominoesGame`, types `DominoesSession`,
   `DominoesPublicState`, `DominoesPrivateState`, `DominoesAction`,
   `DominoTile`, `DominoArm` from `./board-games/dominoes/state`;
   `applyDominoesAction`, `runDominoesBotTurn` from `.../rules`;
   `dominoesBotStrategy` from `.../bot`; the four screens.
2. `type DominoesView = { revision; publicState; privateState; opponentName }`.
3. The 8 useStates + 7 refs (`dominoes*` naming), teardown in the
   unmount effect and `resetToEntry`.
4. Helpers: `dominoesActorKey` (`` `${ps.stage}:${ps.roundNumber}:${ps.turn.turnNumber}` ``),
   `dominoesStale`, `dominoesUpdateViews` (broadcast guest snapshot when
   opponent isn't 'bot'), `startDominoesHost` (code `` `DM-${generateCode()}` ``,
   onJoin creates `createDominoesGame([hostId, guestId], seed)`, rejects a
   second joiner, onAction guards `guestId === dominoesOpponentIdRef.current`),
   `addDominoesHouseBot` (botId 'bot'; NO bot pre-action needed — the bot
   loop handles everything once play starts), `runDominoesBot` /
   `runDominoesBotsIfNeeded` (rummy shape; act via
   `runDominoesBotTurn(session, 'bot', dominoesBotStrategy)`; condition:
   stage 'play' && currentPlayer === 'bot'), `startDominoesGuest`
   (localRevision = -1 gate), `dominoesDispatch`, `dominoesRematch`
   (host-only, fresh seed, reuse playerOrder, revision = prev + 1,
   `dominoesUpdateViews()`).
5. Effects: bot trigger (`[dominoesRole, dominoesView]`, host-only) AND
   the round-transition effect: host-only, when
   `dominoesView?.publicState.stage === 'roundEnd'` and no matchWinnerId,
   `setTimeout` ROUND_PAUSE_MS then apply
   `{ type: 'START_NEXT_ROUND' }` as the HOST player via
   `applyDominoesAction` + commit + `dominoesUpdateViews()`; clear the
   timer on cleanup (copy rummy's round effect exactly).
6. `resolvedDominoesOpponentId` useMemo from `turn.playerOrder`.
7. Landing guard gains `&& !dominoesRole`; join ladder gains
   `code.startsWith('DM-') → startDominoesGuest`; Landing gets
   `onPickDominoes={startDominoesHost}`.
8. Render ladder after battleship, before `return null`:
   - host && waiting → `DominoesRoom`
   - view && stage 'over' && matchWinnerId → `DominoesResults`
   - view && localPlayerId → `DominoesTable` with `publicState`,
     `hand: dominoesView.privateState.hand.cards`,
     `opponentColor="#5b5bd6"`,
     `onPlayTile: (tileId, arm) => dominoesDispatch({ type: 'PLAY_TILE', tileId, arm })`,
     `onDraw: () => dominoesDispatch({ type: 'DRAW_TILE' })`,
     `onPass: () => dominoesDispatch({ type: 'PASS' })`,
     rest prop-for-prop like the RummyTable call site.

## Landing.tsx

Fourth hardcoded tile after Battleship, same structure:
`onPickDominoes`, title "Dominoes", color `#5b5bd6`, blurb
"Match ends, bank the fives.", meta "2 players". Prop
`onPickDominoes: () => void` beside the others.

## Verify (once)

```
npx tsc -b --noEmit
npm test        # 597 green
npm run build
```

## Forbidden

Any file beyond App.tsx + Landing.tsx; touching other games' wiring;
git.

## Report

(1) commands + tallies; (2) what was added where; (3) deviations or "no
deviations".
