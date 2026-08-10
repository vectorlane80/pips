# Spec 18d: Wahoo multi-guest App wiring (M3 part 2)

Modify ONLY `src/App.tsx` and `src/screens/Landing.tsx`. This is the
FIRST multi-seat engine game — the wiring generalizes the rummy pattern
from one guest to up to three, plus a pre-game lobby. Write everything,
verify once. peer.ts already supports N connections (conns map +
broadcast-to-all) — do not modify it.

## Wire protocol (this game's broadcast payload)

```ts
type WahooView =
  | { kind: 'lobby'; roster: { name: string; isBot: boolean; isHost: boolean }[] }
  | { kind: 'game'; revision: number; publicState: WahooPublicState; names: Record<string, string> }
```

Guests gate 'game' views with `shouldAcceptUpdate` (localRevision −1
sentinel); 'lobby' views are applied unconditionally (roster is
idempotent).

## App.tsx — wahoo block (place beside the dominoes block)

State (8+): `wahooRole`, `wahooCode`, `wahooLocalPlayerId`,
`wahooView: WahooView | null`, `wahooConnection`, `wahooNotice`,
`wahooStarted: boolean`, plus host-only roster state
`wahooSeats: { playerId: string; name: string; isBot: boolean }[]`
(host first). Refs mirroring session/host/guest/botBusy/seats/started/
names as the other games do (host callbacks close over stale state).
`wahooSessionRef: WahooSession | null`; `wahooBotSeatsRef:
Set<string>` (house bots + bot-replaced guests).

Helpers:
- `wahooBroadcast()` — host: if !started, broadcast the lobby view built
  from seats; else derive `deriveSnapshot(session, hostId)` (state is
  identical for everyone — one snapshot) and broadcast the game view
  with the names map; also set the host's own `wahooView` the same way.
- `startWahooHost()` — code `` `WH-${generateCode()}` ``; onJoin: if
  startedRef → `reject(guestId, 'Game in progress — spectating comes later.')`;
  if seats full (4) → reject 'Table is full.'; else append
  `{ playerId: guestId, name, isBot: false }`, `wahooBroadcast()`.
  onAction: ONLY accept when startedRef AND the guestId is one of the
  seated playerIds (the guard, per the standing security note); apply
  via `applyWahooAction(session, guestId, action)`, commit on ok,
  broadcast. onLeave: pre-start → drop from seats, broadcast lobby;
  in-game → set notice "<name> disconnected." and remember the seat as
  replaceable (state `wahooDropped: string[]`).
- `addWahooHouseBot()` — host, pre-start, seats < 4: id
  `` `bot-${seats.length}` ``, `randomBotName(taken)`, append with
  isBot, add to botSeats, broadcast.
- `wahooStart()` — host, 2–4 seats: shuffle a COPY of the seat
  playerIds (Math.random, same as seed choice), seed
  `Math.floor(Math.random() * 2147483647)`,
  `createWahooGame(shuffledIds, seed)`, started = true, broadcast.
- `wahooReplaceWithBot(playerId)` — host, in-game, playerId ∈ dropped:
  add to botSeats, rename in names map to `"<name> (bot)"`, clear from
  dropped, broadcast, then `runWahooBotsIfNeeded()`.
- Bot loop `runWahooBots` / `runWahooBotsIfNeeded` — rummy shape;
  actor key `` `${ps.stage}:${ps.turn.turnNumber}` ``; act while the
  CURRENT player id ∈ botSeatsRef and stage 'play', via
  `runWahooBotTurn(session, currentId, wahooBotStrategy)`; the bot
  performs ROLL then MOVE inside one key window (turnNumber only bumps
  on turn hand-off — the inner while loop already handles multi-action
  turns exactly like the dominoes draw chain); wait BASE_MS between
  actions; commit + broadcast each action (guests must see the die).
- `startWahooGuest(code)` — join; apply lobby views to `wahooView`
  directly; game views through the revision gate; guests derive
  "started" from receiving a game view.
- `wahooDispatch(action)` — host: apply-as-host-player + broadcast;
  guest: sendAction.
- `wahooRematch()` — host-only, stage 'over': same seat ids, fresh
  shuffle + seed, recreate, keep started, bump `revision` to prev + 1
  before broadcasting (guest gate).
- Teardown in resetToEntry + unmount, guard additions
  (`!wahooRole` on Landing), join ladder `WH-` → startWahooGuest.

Render ladder (after dominoes, before `return null`):
- `wahooRole && !wahooStarted` (host: from state; guest: view is
  lobby/null) → `WahooRoom` with roster (host: from seats; guest: from
  the lobby view; guests get `isHost={false}` so buttons hide),
  onAddHouseBot/onStartGame wired host-side, onLeave resetToEntry.
- game view + stage 'over' + winnerId → `WahooResults` (isHost gates
  rematch; names from the view).
- game view → `WahooTable` with publicState, names,
  `localPlayerId: wahooLocalPlayerId`, onRoll/onMove via
  wahooDispatch, onLeave resetToEntry. Host additionally renders the
  "replace with bot" affordance: pass `notice` mentioning the
  disconnect; place a small button block above the table (host only,
  when `wahooDropped.length > 0`) — a `div` with one button per
  dropped player: "Replace <name> with a bot" → wahooReplaceWithBot.
  (Inline in App around the WahooTable render, matching notice-banner
  styling; WahooTable itself is untouched.)

## Landing.tsx

Fifth tile: `onPickWahoo`, title "Wahoo", color `#9333ea`, blurb
"Race your marbles home — bump anyone in the way.", meta "2–4 players".
Prop `onPickWahoo: () => void`.

## Verify (once)

```
npx tsc -b --noEmit
npm test        # 662 green
npm run build
```

## Forbidden

peer.ts, engine, wahoo module, Wahoo screens, other games' wiring; git.

## Report

(1) commands + tallies; (2) what was added where; (3) deviations or "no
deviations".
