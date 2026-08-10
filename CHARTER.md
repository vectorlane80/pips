# Charter: Wahoo (2–4 players)

**Mode:** directed
**Started:** 2026-08-09
**Approval:** granted 2026-08-09 with three corrections (no score pills;
triple-six penalty; exact-count center entry with diagonal exit) and the
spectator-block addition — all folded in below. Routing as established: deepseek:flash
implements, sonnet reviews, lead specs/verifies/documents, no Codex.
Brand `#9333ea`. Design source: `Design Handoff/WAHOO.md` (self-flagged
"needs engineering pass") + prototype logic in `Pips.dc.html` (~2691+).

## Strategic note

First MULTI-SEAT game on the engine core (2–4 players). The multi-guest
room/wiring pattern built here becomes the template for lifting the
2-player cap from the other engine games later (explicitly out of scope
now). peer.ts already supports N connections; the cap was per-game
wiring.

## Architecture (locked)

- `src/board-games/wahoo/`: `board.ts` (geometry generator), `state.ts`,
  `rules.ts`, `bot.ts`, tests beside each. Engine core for
  rng/turn/sync/bot. NO card-engine imports (nothing card-shaped here).
- All state is PUBLIC (no hidden info): `HostSession` with 2–4 players,
  empty private states, ONE view broadcast to every guest — the simplest
  sync shape yet.
- Distance-based state model (constants exported from the module): per
  marble `-1` base, `-2` center, `0..57` owner track path (relative to
  own come-out), `58..61` home lane. TRACK_LEN 64. Geometry never
  touches game state.

## Board geometry (the salvage, locked)

`board.ts` defines ONE quadrant in unit coordinates and rotates it ×4,
faithful to the designer's dot diagram (topology v3 after two user
corrections): arms FIVE holes wide; 16 track holes per quadrant (5 up
the edge, tip corner, 3 tip middles, tip corner, 5 down, one SHARED
inner corner → 64 total); home lane of 4 hanging from the OWN TIP
MIDDLE (the corner-turn entrance, rel 57); come-out just above the
seat's own corner (rel 0); corners at rel {1,17,33,49}, shortcut
entries {1,17} exiting diagonally at {33,49}; DIAGONAL 4-hole bases;
one shared center hole.
Unit tests assert: 52 unique track holes, uniform neighbor spacing,
exact four-fold rotational symmetry, corners/center present, no
overlaps. The table screen renders holes/marbles from this generator +
the distance model — pure view, same discipline as the dominoes snake.

## Rules (handoff + locked resolutions)

- Single die (host rng). Roll 1 or 6 to bring a marble out of base onto
  your entry hole. Move exact counts; never land on your own marble;
  landing on an opponent bumps them to base. Can't overshoot home.
- **Home/win (resolution):** the home lane fills back-to-front — exact
  count to enter, no passing your own marbles in the lane; first player
  with all four marbles in their lane wins immediately.
- **Center shortcut (user-corrected):** the center sits one step beyond
  a corner — a roll of exactly (distance-to-corner + 1) through one of
  YOUR VALID corners may enter it as an alternative move. Valid entry
  corners are the two whose diagonal opposite is still forward
  progress — rel 1 and 17 under topology v3; entries at 33/49 would
  exit backward and are never offered. The center is a stop (max one
  marble, bump applies) and remembers its entry corner; exit on a 1 or
  6 onto the DIAGONALLY OPPOSITE corner (rel 33 or 49), then travel
  normally.
- **Extra turn on a 6**, and THREE 6s in a row is a bust: the last
  marble you moved goes back to base and the turn passes (track the
  six-streak and last-moved marble within the turn chain).
- No legal move after a roll → the turn passes (host auto-advances after
  the die is shown).
- Seats/colors fixed Red/Blue/Green/Yellow. 2 players → opposite arms
  (random pair); 3 → random three arms, fourth rendered muted; 4 → all.
  Colors randomly assigned at start. (One-player-two-colors: deferred
  variant, not in this charter.)

## Multi-seat room (new pattern, locked)

WahooRoom: host waits, up to 3 guests join by code (`WH-` prefix), host
can add house bots to fill, explicit **Start game** button enabled at
2–4 seated (unlike the 2-player games' auto-start). Seat list shows
names + assigned colors after start. Guests joining after start or
beyond 4 are rejected. Bot loop runs per-bot-seat through the same
runBotTurn path; disconnected guest's seat: marbles freeze, host may
fill with a bot (simple resolution: a "replace with bot" button on the
host's screen — keeps the match alive without reconnect plumbing).

## Bot (locked priority policy, deterministic)

On its roll, first legal in: win-completing move → bump move → enter
home lane → take shortcut (when it shortens distance-to-home) → bring
out of base (on 1/6) → advance the marble closest to home. Ties by
marble index.

## Screens

WahooRoom / WahooTable (+css) / WahooResults / WahooRulesOverlay per
repo idiom — NO ScoreHeader/score pills (user order; marbles-home lives
in the legend). Die + action buttons above the board, legend + status
below, board max 660px square centered. Marbles as colored circles with hard shadows; movement as a
simple translate transition; no animation beyond that.

## Sounds

Existing `dice-roll` for the roll. Placeholders wired for `marble-move`
(reuse `piece-drop`) and `wahoo-bump` (reuse `farkle-bust`); real-file
list delivered at wrap-up, same drill as Battleship.

## Non-goals

- Retrofitting other games to >2 players (next charter, using this
  pattern). One-player-two-colors variant. Difficulty knobs. Spectators.
  Reconnect/resume for dropped guests beyond bot replacement.

## Milestones

- M1 (spec 18): `board.ts` generator + symmetry/connectivity tests.
- M2 (spec 18b): state/rules/bot + tests — 2/3/4-seat games, base
  entry, exact counts, bump, center in/out, home fill, win, no-move
  pass, extra-turn-on-6, full bot-vs-bot sims at every seat count.
- M3 (spec 18c/d): screens + multi-guest App wiring (start-gated room,
  N-guest broadcast, per-seat bot loop, DM-style join routing `WH-`).
- M4: live verification (host + 3 bots full game; two-browser guest
  smoke via a second tab if feasible), full-diff review, docs
  (`docs/wahoo.md`), sound list, commit offer.

## Definition of done

Full 4-seat game (host + bots) plays to a win in the browser with the
corrected symmetric board; 2-seat opposite-arms and 3-seat muted-arm
modes verified at least to mid-game; suite/tsc/build green; reviews
clean; the multi-seat pattern documented for the coming retrofits.

## Run budget

12 cycles (expect 3–4). Any milestone stuck 3 cycles → pivot/pause.
