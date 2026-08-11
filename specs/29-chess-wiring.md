# Spec 29 — Chess wiring: App, route, landing

You own edits to EXACTLY these files (no new files):

- `src/App.tsx`
- `src/state/route.ts`
- `src/state/route.test.ts`
- `src/screens/Landing.tsx`
- `README.md`

Chess is a 2-player engine game wired like **Battleship**, not Checkers —
Battleship's simpler "waiting flag + single opponentId" model (no seats
array, no lobby roster) matches what `ChessRoom`/`ChessTable` already
assume. Grep App.tsx for every `battleship`/`Battleship`/`BS-` site and
mirror it for chess, with a difficulty field added alongside variant the
way Battleship carries `battleshipVariant`.

## Specifics

1. **Code prefix** `CH-`; route segment `chess` added to `RoutedGame` +
   `GAME_SEGMENTS`; route.test.ts gets the same per-game cases the other
   games have (gamePath, gameFromPath, decideBoot host deep-link).
2. **Difficulty state**: `chessDifficulty` state + ref, defaulting
   `'easy'`, mirroring `battleshipVariant`/`battleshipVariantRef` exactly.
   `onSetDifficulty` setter passed to `ChessRoom` sets both.
3. **Host session**: `createChessGame([hostId, guestId], chessDifficultyRef.current, seed)`
   on guest join (mirror `startBattleshipHost`'s `onJoin`), and in
   `addChessHouseBot` (mirror `addBattleshipHouseBot` — but Chess has NO
   placement phase, so there's no `runBattleshipBotTurn`-style immediate
   bot action needed; if it's the bot's turn immediately after creation
   (bot is black, i.e. guestId/botId is seat 1) the bot loop's own effect
   picks it up next tick — don't hand-fire a first move here).
4. **View type**: `ChessView = { revision: number; publicState: ChessPublicState; opponentName: string }`
   (mirror `BattleshipView`, no privateState — chess has none).
5. **Action dispatch**: `chessDispatch(action: ChessAction)` mirroring
   Battleship's action-send pattern for MOVE/RESIGN/OFFER_DRAW/
   ACCEPT_DRAW/DECLINE_DRAW.
6. **Bot loop**: mirror Battleship's bot-turn effect using
   `makeEasyChessBotStrategy(game.rng)` / `makeNormalChessBotStrategy()`
   keyed off `publicState.difficulty` (hard is not yet playable — spec 28
   already disables selecting it in the room, so this switch never sees
   'hard' in practice, but write it as a fallthrough to normal with a
   one-line comment rather than an unreachable-branch crash, in case a
   stale session somehow carries 'hard'). Actor key: mirror how Battleship
   keys its bot effect (`battleshipActorKey` or similar) — for chess, use
   `${stage}:${turn.turnNumber}` (no chain/mid-turn complication like
   checkers; every accepted action advances turnNumber except pure
   draw-offer bookkeeping, which never triggers a bot move anyway since
   the bot never proposes those).
7. **liveGameNow()/pushGameUrl**: include chess exactly where battleship
   is included, same 'over' stage exclusion.
8. **Table props**: `colors` = local `var(--green-text)` / opponent brand
   `#0891b2` (matching what ChessResults already assumes internally —
   confirm by reading ChessResults.tsx's own fixed-color convention and
   keep the two consistent). `names` = `{ [localId]: name, [opponentId]:
   opponentName }`. `onResign`/`onOfferDraw`/`onAcceptDraw`/`onDeclineDraw`
   each dispatch the matching `ChessAction`.
9. **Results**: mirror Battleship's results wiring; rematch = host creates
   a fresh `createChessGame` with the same two seats, same difficulty,
   new seed (mirror `checkersRematch`'s revision-carry-forward pattern
   since Battleship's own rematch may differ — check both, use whichever
   actually fits chess's single-game-no-best-of shape).
10. **Landing tile**: after Checkers, before Hangman (matching the
    designer's shelf order from the prototype extraction: …Checkers,
    Chess, Hangman…): "Chess" / "Full rules, castling and all" /
    "2 players" / `#0891b2`, prop `onPickChess`. Bump the shelf list to
    13 entries (count derives from the array length already — no manual
    number).
11. **README**: games sentence becomes "Thirteen games: …, **Checkers**,
    and **Chess**." (keep the existing "Farkle and Yahtzee seat up to 8…"
    clause, just extend the game list and count).

## Verify before reporting

`npx tsc -b --noEmit` silent; `npm test` green (820 + your route tests);
`npm run build` succeeds. Report every Battleship site mirrored, the
difficulty-switch fallthrough decision, verbatim final outputs. If a site
doesn't map cleanly, STOP and report honestly rather than improvising.
