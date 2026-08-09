# Spec 14b: Battleship App wiring (M2 part 2)

Wire the existing Battleship module + screens into the app. Modify ONLY
`src/App.tsx` and `src/screens/Landing.tsx`. The pattern to copy is the
existing Rummy wiring — Battleship is its third sibling (Rummy, Phase 10,
Battleship). Work file-section by file-section, write ALL edits first, run
verification once at the end (do not interleave — budget your tool calls).

Differences from Rummy to keep in mind throughout:
- No rounds: no START_NEXT_ROUND, no round-transition effect, no
  ROUND_PAUSE_MS timer.
- Match over when `publicState.stage === 'over'` (not matchWinnerId).
- The bot must place its fleet immediately at session creation (humans
  place via UI; the bot loop only handles battle turns).
- Actions: `onPlaceFleet` / `onFire` instead of Rummy's five.

## App.tsx

Copy the Rummy wiring piece by piece (the Rummy anchors are cited so you
can find each pattern; add the Battleship twin near each Phase 10 twin):

1. **Imports** (near the rummy/phase10 import blocks, ~lines 21–37):
   from `./board-games/battleship/state` — `createBattleshipGame`, types
   `BattleshipSession`, `BattleshipPublicState`, `BattleshipPrivateState`,
   `BattleshipAction`, `ShipId`; from `./board-games/battleship/rules` —
   `applyBattleshipAction`, `runBattleshipBotTurn`; from
   `./board-games/battleship/bot` — `makeBattleshipBotStrategy`; screens
   `BattleshipRoom`, `BattleshipTable`, `BattleshipResults`.

2. **View type** (after `Phase10View`, ~line 40):
   `type BattleshipView = { revision: number; publicState: BattleshipPublicState; privateState: BattleshipPrivateState; opponentName: string }`

3. **State** (after the phase10 useStates, ~66): the 8 Battleship twins —
   `battleshipRole` (`'host' | 'guest' | null`), `battleshipCode`,
   `battleshipLocalPlayerId`, `battleshipOpponentId`,
   `battleshipOpponentName`, `battleshipView: BattleshipView | null`,
   `battleshipConnection`, `battleshipWaiting`.

4. **Refs** (after phase10 refs, ~88): `battleshipSessionRef`
   (`BattleshipSession | null`), `battleshipHostRef`, `battleshipGuestRef`,
   `battleshipBotBusyRef`, plus mirrored `battleshipLocalPlayerIdRef`,
   `battleshipOpponentIdRef`, `battleshipOpponentNameRef` — identical roles
   to the rummy ones (host callbacks close over stale state).

5. **Teardown**: add `battleshipHostRef`/`battleshipGuestRef` destroy to the
   unmount effect (~104–107) and a full battleship reset block to
   `resetToEntry` (~192–208), mirroring the rummy block (null the refs,
   reset all 8 states).

6. **Helpers** (after the phase10 helpers, ~412–580 region), each the exact
   rummy shape with these substitutions:
   - `battleshipActorKey(bs)` = `` `${ps.stage}:${ps.turn.turnNumber}` ``;
     `battleshipStale(key)` same as `rummyStale`.
   - `battleshipUpdateViews()` — like `rummyUpdateViews` (App.tsx:260):
     derive local snapshot → `setBattleshipView({..., opponentName: battleshipOpponentNameRef.current})`;
     if the opponent id is set and not `'bot'`, derive the guest snapshot
     and `battleshipHostRef.current?.broadcast({...})` with
     `opponentName: nameRef.current` (host's own name — copy how rummy
     passes the host name to the guest).
   - `startBattleshipHost()` — code `` `BS-${generateCode()}` ``; host id
     `peerIdForCode(code)`; `createHost` with `onJoin` creating
     `createBattleshipGame([hostId, guestId], seed)` (seed
     `Math.floor(Math.random() * 2147483647)`), rejecting a second joiner;
     **`onAction` MUST guard `guestId === battleshipOpponentIdRef.current`
     before applying** (same guard as rummy's, App.tsx:295 — this is the
     documented security boundary for third-party ids); apply via
     `applyBattleshipAction(session, guestId, action)`, commit only when
     `outcome.ok`, then `battleshipUpdateViews()`.
   - `addBattleshipHouseBot()` — like `addRummyHouseBot` (App.tsx:313):
     opponent id literal `'bot'`, `randomBotName([name])`, create the game,
     then IMMEDIATELY place the bot fleet:
     `const placed = runBattleshipBotTurn(bs, 'bot', makeBattleshipBotStrategy(bs.rng))`
     — commit `placed.bs` as the session (its outcome is always ok in the
     placing stage; do not add a fallback path), then set refs/states and
     `battleshipUpdateViews()`.
   - `runBattleshipBot` / `runBattleshipBotsIfNeeded` — copy the rummy pair
     (App.tsx:327–358) with: busy ref, condition
     `ps.stage === 'battle' && currentPlayer(ps.turn) === 'bot'` (instead of
     rummy's roundOver/matchWinner checks), strategy
     `makeBattleshipBotStrategy(bsRef.current.rng)` per call, wait
     `BASE_MS`, stale-key re-checks, 50 ms tail reschedule, and the direct
     `deriveSnapshot`+`setBattleshipView` commit (bot exists only without a
     guest — no broadcast), matching rummy exactly.
   - `startBattleshipGuest(code)` — copy `startRummyGuest` (App.tsx:363):
     closure-local `let localRevision = -1`, gate with
     `shouldAcceptUpdate`, apply snapshots to the 8 states.
   - `battleshipDispatch(action: BattleshipAction)` — host applies locally
     (drop if `!ok`) + `battleshipUpdateViews()`; guest
     `battleshipGuestRef.current?.sendAction(action)`.
   - `battleshipRematch()` — host-only like `rummyRematch` (App.tsx:403):
     fresh seed, reuse `turn.playerOrder`, **force
     `session.revision = prev.revision + 1`** (guest gate), and when the
     opponent is `'bot'`, immediately re-place the bot fleet exactly as in
     `addBattleshipHouseBot`, then `battleshipUpdateViews()`.

7. **Effects** (after the phase10 bot-trigger effect, ~768–772): ONE effect
   — the bot trigger (`[battleshipRole, battleshipView]` deps, host-only,
   call `runBattleshipBotsIfNeeded()`). No round-transition effect.

8. **`resolvedBattleshipOpponentId`** useMemo — copy the rummy one
   (App.tsx:760): derive the opponent id from
   `battleshipView.publicState.turn.playerOrder` vs local id.

9. **Landing guard + join routing**: the Landing render condition
   (~line 799) gains `&& !battleshipRole`; the join-prefix ladder
   (~806–811) gains `code.startsWith('BS-') → startBattleshipGuest`.
   Landing gets `onPickBattleship={() => { startBattleshipHost() }}` —
   match exactly how `onPickRummy` is passed.

10. **Render branches** (after the Phase 10 ladder, before `return null`
    at ~1025), the three-branch ladder:
    - `battleshipRole === 'host' && battleshipWaiting` → `BattleshipRoom`
      (`code`, `localName: name`, `notice`, `onAddHouseBot: addBattleshipHouseBot`,
      `onLeave: resetToEntry`)
    - `battleshipView && battleshipView.publicState.stage === 'over' && battleshipView.publicState.winnerId`
      → `BattleshipResults` (`isHost: battleshipRole === 'host'`,
      `onRematch: battleshipRematch`, `onBackToShelf: resetToEntry`, rest
      from state)
    - `battleshipView && battleshipLocalPlayerId` → `BattleshipTable` with
      `publicState`, `board: battleshipView.privateState.board`,
      `opponentColor="#1a6fae"`,
      `onPlaceFleet: (b) => battleshipDispatch({ type: 'PLACE_FLEET', board: b })`,
      `onFire: (cell) => battleshipDispatch({ type: 'FIRE', cell })`,
      `onOpenRules: () => {}`, `onLeave: resetToEntry`, connection/notice
      from state — mirror the RummyTable call site prop-for-prop
      (App.tsx:936–965).

## Landing.tsx

Add a Battleship shelf tile as a third hardcoded block right after the
Phase 10 tile (lines ~126–145), copying its structure exactly:
`onClick={onPickBattleship}`, title "Battleship", color `#1a6fae`,
blurb "Place your fleet, call your shots, sink all five.", meta
"2 players". Add `onPickBattleship: () => void` beside `onPickRummy` /
`onPickPhase10` in the props.

## Verification (once, at the end)

```
npx tsc -b --noEmit
npm test          # 514 tests green
npm run build
```

## Forbidden

Any file other than `src/App.tsx` and `src/screens/Landing.tsx`. Changing
Rummy/Phase 10/legacy behavior. New dependencies. `git` commands.

## Report

(1) commands + verbatim tallies; (2) summary of what was added where;
(3) deviations or "no deviations".
