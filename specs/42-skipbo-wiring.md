# Spec 42 — Skip-Bo wiring

Third and final spec building Skip-Bo (read `CHARTER.md` first). Specs
40 (engine) and 41 (screens) are done and landed — do not touch either.
This spec wires the landed screens into `App.tsx` so Skip-Bo is
actually reachable and playable, plus the `Landing.tsx` shelf tile and
a `README.md` mention. This is the highest-risk spec of the three:
host-authoritative PeerJS state and private-hand delivery, same risk
class as Rummy's own wiring spec (36) and Phase 10's (38) — it will
get a personal adversarial review, not a delegated one, so get the
privacy boundary right.

Read the Rummy section of `App.tsx` FIRST, in full, before writing
anything — grep for `rummy`/`Rummy` and read every function in that
section (`rummyBroadcast`, `startRummyHost`, `addRummyHouseBot`,
`rummyStart`, `runRummyBot`/`runRummyBotsIfNeeded`, `startRummyGuest`,
`rummyDispatch`, `rummyRematch`, and the three render branches). This
spec mirrors that shape almost exactly — the differences are called
out explicitly below; everything NOT called out should match Rummy's
pattern precisely, not be redesigned.

You own edits to exactly these files. Do not touch any other game's
wiring in `App.tsx`:

- `src/App.tsx` (Skip-Bo wiring section only)
- `src/screens/Landing.tsx` (Skip-Bo shelf tile)
- `README.md` (Skip-Bo's seat range, added to the existing sentence
  that lists every N-player game's range)

## Mirror Rummy's wiring shape exactly, for:

- Lobby/broadcast model: `skipBoBroadcast()` broadcasts the roster
  during the lobby phase; during game phase, compute the host's own
  view from a local `deriveSnapshot` call and `sendTo` every other
  non-host non-bot seat their own private snapshot individually —
  NEVER a single shared broadcast once more than 1 guest can be
  seated. This is the single most important correctness property in
  this whole spec: a `SkipBoPrivateState` carries `stock`, `hand`, AND
  `discards` — all three must go ONLY to their owning seat, never
  broadcast. `discardTops` (the public-facing top-card-only view) is
  already public state and fine to broadcast to everyone.
- `startSkipBoHost()`'s `onJoin`: reject on started-flag first, then
  seat-cap (`SKIPBO_MAX_SEATS`).
- `addSkipBoHouseBot()`: capped, repeatable, and MUST use a
  **monotonically increasing per-room counter** for bot ids (`bot-
  ${counterRef.current}`, incrementing before use) — NOT the old
  `bot-${seats.length}` scheme. That scheme had a real, confirmed
  collision bug (see spec 39, already fixed in Rummy/Phase10/Wahoo/
  Mexican Train/Uno) — Skip-Bo is being built AFTER that fix landed,
  so implement it correctly from the start rather than reintroducing
  a bug this project already paid to fix once. Add a
  `skipBoBotCounterRef = useRef(0)` next to `skipBoBotSeatsRef`,
  increment-then-use in `addSkipBoHouseBot`, reset to 0 everywhere
  `skipBoBotSeatsRef.current.clear()` is reset (the room-reset paths).
- `skipBoStart()`: validates seat count against `SKIPBO_MIN_SEATS`/
  `SKIPBO_MAX_SEATS`, calls `createSkipBoGame(seats, seed)`.
- `startSkipBoGuest()`/`skipBoDispatch()`: same shape as Rummy's.
- Seat-ink palette: reuse Uno's palette (first 4 entries, since
  `SKIPBO_MAX_SEATS = 4` — same palette-reuse convention every prior
  charter used, no new colors invented).

## What's genuinely different from Rummy — decided here, don't guess

**No score/match layer.** Skip-Bo's `SkipBoPublicState` has
`roundOver`/`winnerId`, not `matchWinnerId`/`scores`/`target`. Every
place Rummy's wiring checks `matchWinnerId` for "is the match over,
show Results," Skip-Bo checks `winnerId !== null` (equivalently
`roundOver`, they're set together). There is no "start next round"
action or state — a completed game only ever offers a rematch.

**`skipBoRematch()` creates a completely fresh game, not a scored next
round.** Mirror Battleship/Dominoes/Checkers/Chess's rematch precedent
(read whichever of those you find clearest — probably
`dominoesRematch` or similar), NOT Rummy's `rummyRematch` (which
carries `seatOrder` forward into a new round of an ongoing match).
Skip-Bo's rematch: same `seatOrder`, brand-new seed,
`createSkipBoGame(seatOrder, newSeed)` — there's no running score to
preserve because there never was one.

**Bot pacing — read this section carefully, it is this project's
standing top priority (`CLAUDE.md`'s "bots play at human speed"
section) and Skip-Bo's turn shape makes it easy to get wrong.** Unlike
every other card game in this app, a single Skip-Bo turn can involve
MANY actions in a row before it ends — a bot might play its stockpile
top, then a discard-pile top, then two hand cards, before finally
discarding. Rummy/Phase10/Uno's bot turns are at most 2 actions
(draw + discard/play). This means a naive port of Rummy's bot-loop
pacing (one `BASE_MS` wait per LOOP ITERATION, where each iteration is
one turn) would let a Skip-Bo bot fire 4-5 actions back to back with
NO pacing between them if the loop's wait is structured around "per
turn" instead of "per action." It must NOT do that. Every single
action the bot loop issues — whether it's the 1st or the 5th action of
one bot's turn — needs its own `BASE_MS`-scale wait before it fires,
exactly like Rummy's loop already waits before EACH call to
`runRummyBotTurn` (check this — Rummy's own loop structure already
waits per-action, not per-turn, since a Rummy bot turn is only ever
1-2 actions so the distinction was never stress-tested before; Skip-
Bo is the first game where getting this wrong would be visible and
bad). Structure `runSkipBoBot(botId, key)`'s loop so it `await
wait(BASE_MS)` before EVERY call to `runSkipBoBotTurn`, not once
before the whole turn — the loop naturally continues (still checking
`phase10Stale`-equivalent staleness and `currentPlayer(ps.turn) ===
botId`) until a DISCARD/PASS actually advances the turn to a different
seat, or the round ends. Also check `roundOver`/`winnerId` after
EVERY action inside the loop (not just at the top) and break
immediately if set — a mid-turn win must stop the bot loop instantly,
same as it stops a human's turn instantly.

**No deal-intro-duration bot hold-off is needed the way Uno's spec
34i needed one** — Skip-Bo's `DealIntro` only shows for the LOCAL
client's own animation; there's no cross-client host/bot race to guard
here since the host doesn't start running bots until `skipBoStart()`'s
own state transition, which happens before any client's local
`showIntro` even begins (same as Rummy/Phase10 — this note exists only
so you don't go looking for an `estimateDealIntroMs`-based guard that
this spec doesn't need).

## Landing.tsx / README.md

Shelf tile: `{ title: 'Skip-Bo', note: '2–4 players', color: '#be185d',
onClick: onPickSkipBo }`, inserted in the shelf array wherever reads
naturally (alongside the other card games). README's seat-range
sentence gains a Skip-Bo clause matching the existing list's style.

## Verify before reporting

`npx tsc -b --noEmit`, `npm test -- --run` (expect 1017 unchanged —
wiring doesn't get dedicated tests in this codebase's established
practice), `npm run build`. You have no way to visually verify any of
this yourself — say so plainly. Report a summary, every judgment call,
and specifically walk through: (1) the exact `skipBoBroadcast` logic
proving no private zone (`stock`/`hand`/`discards`) ever reaches a
non-owning client, (2) the bot-loop pacing structure proving every
individual action gets its own wait rather than one wait per turn,
(3) confirmation the new-scheme bot-id counter is used (not the old
collision-prone `bot-${seats.length}`), and (4) the rematch's fresh-
game (not next-round) behavior.
