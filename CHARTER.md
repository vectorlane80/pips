# Charter: Battleship

**Mode:** directed
**Started:** 2026-08-09
**Pre-approved:** yes — user: "Now, implement battleship from the design
handoff folder," with `/autonomous-dev-loop` + `/model-routing`, "favor
deepseek over codex." Also requested: at wrap-up, a list of needed sound
files (their guess: hit, miss, sunk — confirm or extend).

**Delegation:** implementation + tests → `deepseek:flash` (user prefers
DeepSeek; probed OK earlier today); adversarial review → `claude --model
sonnet --effort medium`; spec/verify/docs/git → lead (Fable session).
Commits: the user authorized commit+push for the previous charter's wrap-up;
this charter returns to the repo default — land verified, request commit
authorization at wrap-up (project CLAUDE.md forbids the loop committing
without it).

## Design source
`Design Handoff/BATTLESHIP.md` + working prototype in
`Design Handoff/Pips.dc.html` (logic ~1600–1790, view ~2380–2465, markup
~415–510). Assets in `Design Handoff/assets/battleship/`. Brand `#1a6fae`.

## Architecture decision (locked)

Battleship has hidden information (enemy ship positions), so it CANNOT join
the old broadcast-everything system (`src/state/room.ts`) — a guest would
receive the opponent's board over the wire. It is the first non-card game on
the engine core: `src/engine/` `HostSession` with per-player private state
(your board) and public state (shots, sunk reveals, turn), mirroring the
Rummy/Phase 10 wiring shape (own Room/Table/Results screens, host-side
session, action intents over PeerJS, `runBotTurn` for the house bot).

Game logic lives in `src/board-games/battleship/` (`state.ts`, `rules.ts`,
`bot.ts`, tests beside code) — the board-game sibling of
`src/card-games/<game>/`. Nothing goes in `src/engine/` (no grid engine,
per the standing investigation) and nothing card-related is touched.

## Rules (locked, from prototype)
- Fleet: Carrier 5, Battleship 4, Cruiser 3, Submarine 3, Destroyer 2.
  10×10 board, flat 100-cell row-major array, cell = ship id | null.
- Placement: anchor + orientation h (extends right) / v (extends down); no
  overlap, no off-grid. Randomize-remaining available. Battle starts only
  when both players' five ships are down.
- Battle: one shot per turn, turn passes after every shot (hit or miss).
  Shot marks `hit`/`miss`; a ship with all cells hit is sunk (+1 score to
  shooter, shape revealed to the shooter). All five sunk = match over,
  single match, no rematch series.
- Bot: hunt/target — if any unresolved hit exists on the target board, fire
  only at unfired orthogonal neighbors of unresolved hits; else random
  unfired cell. Bot never reads unhit ship positions.
- Host-authoritative: both fleets live host-side; clients see only their own
  board plus shot outcomes. Sunk reveal sends the sunk ship's cells only.

## Hidden-information contract (locked)
- Private state per player: their own board (ship placements).
- Public state: both players' hit/miss grids, sunk-ship reveals (ship id +
  cells, only once sunk), fleet-status pills data (own = true state via
  private board; enemy = sunk-only), turn state, phase, scores, status.
- The enemy's unsunk ship positions must never appear in public state or in
  the guest's snapshot. This is the review's #1 attack target every cycle.
- Placement happens client-side (layout is the player's secret) and is
  submitted as a PLACE_FLEET action; host validates legality (exact fleet,
  no overlap, in bounds) before accepting. Randomize uses client-local
  Math.random — layout secrecy, not fairness, is what matters; host RNG
  (`createRng`) seeds only the bot's placement + targeting.

## Non-goals
- No grid engine; index math is written inline in the game module.
- No rematch series / best-of; no round system.
- No difficulty levels (one bot policy, like the prototype).
- No spectators, no >2 players.
- Placeholder sounds only if trivially reusable; the real deliverable is
  the wrap-up sound-file list for the user (their guess: hit, miss, sunk).
- No automated DOM tests (repo has no jsdom); UI is live-verified in the
  browser per established practice.

## Milestones
- M1: game module — `src/board-games/battleship/state.ts` (types, session
  creation), `rules.ts` (ActionValidator: PLACE_FLEET, FIRE), `bot.ts`
  (placement + hunt/target strategy) + vitest coverage incl. a
  no-leak test asserting the guest snapshot never contains enemy ship
  cells.
- M2: screens + wiring — BattleshipRoom/Table/Results (or shared-results
  reuse), placement UI (tray, hover preview, rotate incl. spacebar,
  randomize, start), battle UI (fire, markers, ship art, fleet pills),
  App.tsx routing + bot loop, Landing/room-picker entries, assets copied
  to the repo's static-asset location, sounds wired where files exist.
- M3: live browser verification of a full host-vs-bot match; review of the
  full charter diff (leak hunt); docs (`docs/battleship.md`), README,
  state files; sound-file list delivered in chat.

## Definition of done
- Full host-vs-bot match plays placement → battle → results in a real
  browser with zero console errors; host-vs-guest flow code-reviewed for
  leaks (live two-peer test if feasible in one browser pane, else
  snapshot-level tests + review stand in).
- `npx tsc -b --noEmit`, `npm test`, `npm run build` clean throughout.
- Review finds no path that exposes enemy unsunk positions to a client.
- Sound-file list (with any beyond hit/miss/sunk justified) reported.

## Run budget
8 cycles (expect 3). Any milestone unresolved after 3 cycles forces a
pivot/pause decision. Single-charter attended run: no safety-net cron
(logged deviation, same rationale as the engine-core run).
