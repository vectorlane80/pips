# Charter: Checkers + Mexican Train (design handoff, 2026-08-10)

Two new games from the refreshed design handoff, plus the landing's game-count
label. Chess is in the handoff too but **explicitly deferred** by the user.

## Target user / use case
Same as the site: a few people around a table (or apart) sharing a room code.
Checkers is the third head-to-head board game; Mexican Train is the second
multi-seat game and the first four-seat-always game.

## Scope

### M1 — Checkers module (`src/board-games/checkers/`)
Engine game, host-authoritative, 2 players. state/rules/bot + tests.
- 8×8, 12 pieces each, dark squares `(r+c)%2===1`; seat 0 bottom moving up.
- **Optional capture** (jumps never forced as the first move of a turn).
- **Forced multi-jump**: once a piece jumps, if it can jump again the turn does
  not pass; the mover is locked to that piece until its captures run out.
- Kings: far row crowns; kings move/jump one square in all four diagonals.
- Game ends when the side to move has no pieces or no legal move; match is
  best-of-5 (first to 3), starter alternates games, running games-won score.
- Bot: random among chain-continuations, else captures, else simple moves.

### M2 — Checkers screens + wiring
Room (2 seats, bot fill), Table, Results, RulesOverlay, CSS; App wiring with
`CK-` code prefix; route segment `checkers`; landing tile
("Jump the diagonals, crown a king" / "2 players" / `#b45309`). Sounds:
`checker-moving` (simple move), `checker-jumping-over` (each hop),
`king-me` (crowning), existing round/game-win for game and match ends.

### M3 — Mexican Train module (`src/board-games/mexican-train/`)
Engine game, host-authoritative, **exactly 4 seats** (humans + bot fill).
- Double-12 set (91 tiles). 13 rounds, engines double-12 down to double-0.
- Deal: pull the round's engine double out of the set first, then 13 tiles to
  each seat; boneyard is the remaining 38.
- Five lanes: own train, the three others', the Mexican train. Own + Mexican
  always playable; another seat's only when marked open. Empty lanes extend
  from the engine value.
- Can't play: draw one (if boneyard has tiles) and play it if legal; otherwise
  your train is marked open and the turn passes. Playing on your own train
  clears your open marker. Playing a double grants an immediate extra play.
- Round ends when a hand empties (goes out) or four consecutive open-marks
  with an empty boneyard (blocked). Everyone adds their remaining pips to a
  running total; going out adds 0. After round 13, lowest total wins.
- Bot: rank (own train > Mexican > open opponent) ×100 + double bonus 20 +
  pip sum; draws like a human when stuck.

### M4 — Mexican Train screens + wiring
Room (4 seats min = max, Start requires a full table — bots fill), Table,
Results (sorted **ascending**, the only game where lower wins), RulesOverlay,
CSS; `MT-` code prefix; route segment `mexican-train`; landing tile
("Build your train, dodge the pips" / "4 players" / `#c2410c`). Lanes render
as wrapping tile rows (the snake direction from the addendum — no radial hub);
tiles are numeral halves, `inner|outer` with the match facing the station.
Sounds: `train-horn` when any train is marked open and on a blocked round;
`domino-play` / `domino-draw` / `dominoes-shuffling` reused; round/game-win.
Multi-seat wiring follows the Wahoo pattern: lobby broadcast, seated-id action
gating, per-seat bot loop, replace-dropped-guest-with-bot, spectator block.

### M5 — Landing count label
"On the shelf" gains `"<n> games"` (12px/500 faint) once a name is entered
(the "type a name to start one" hint already exists for the empty state).

## Resolutions (deviations from the prototype, decided by the lead)
1. **Crowning ends the jump chain** (standard rules; the handoff says
   "standard kings"). The prototype let a freshly crowned piece keep jumping
   backwards — not carried over.
2. **Engine never stuck in the boneyard**: prototype dealt 52 then searched
   hands for the engine (silently mis-crediting seat 0 when it was in the
   boneyard). We pull the engine from the set pre-deal; every seat gets 13.
3. **Round starter rotates** (round r starts at seat r mod 4) since no seat
   "plays" the engine under resolution 2.
4. **Double-followup deadlock fixed**: after a double, if the mover has no
   legal play the normal can't-play path applies (draw / open / pass). The
   prototype hung forever here.
5. "You wins this game" grammar bug: fixed ("You win…").
6. No must-cover-the-double rule, and the Mexican train needs no starter —
   the prototype's simplified rules stand (per the handoff).

## Non-goals
Chess (deferred by the user). Spectators. Mexican Train seat counts other
than 4. Per-game code splitting. Prototype's turn-log panel.

## Definition of done
Both games playable live against bots end to end (Checkers: full best-of-5;
MT: at least a multi-round stretch incl. going out, a blocked round, a double
followup, an opened train), all module rules unit-tested, tsc/build/tests
green, Oscar module + wiring reviews passed, Oscar **visual** check of both
boards passed, docs updated. One commit per milestone, user authorizes pushes.

## Stop criteria / budget
Directed default: 25 cycles cap (expect ~6–8). Any milestone still unresolved
after 3 cycles forces a re-scope decision. Implementer: deepseek (flash),
reviewer: Oscar on sonnet, never Codex.
