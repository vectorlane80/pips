# Charter: URL routing + name cookie

**Mode:** directed
**Started:** 2026-08-10
**Approval:** granted with three answers: (1) confirm-guard on Back
during a live game; (2) production is GitHub Pages → ship the 404
fallback; (3) guests get the game URL too. Routing: deepseek:flash
implements, sonnet reviews, no Codex. Prereq for the next wave of games.

## Design (locked)

- Hand-rolled history routing, no router dependency. Path map
  `/pips/<segment>` for all ten games (farkle, yahtzee, ttt, hangman,
  connect4, rummy, phase10, battleship, dominoes, wahoo).
- Entering a game (host from shelf OR guest via code) pushes
  `/pips/<game>` — ONE history entry per game session; nothing deeper.
  The legacy room's in-room game picker updates the segment via
  replaceState. Back is therefore always one step to `/pips`.
- popstate → if a game is LIVE (legacy: room screen past 'room';
  engine: started/stage in play), `window.confirm` "Leave the game?" —
  decline pushes the game URL back; accept = full teardown to shelf.
  Pre-start rooms exit without confirm.
- In-app Leave = teardown + replaceState('/pips') (robust for
  deep-linked sessions with no prior entry; the adjacent-duplicate
  /pips history entry is harmless).
- Deep link / refresh boot: `/pips/<game>` + name cookie → auto-run
  that game's host pre-start flow (fresh room + code); no cookie →
  shelf. `?join=CODE` keeps working as today.
- Name cookie `pips-name` (1 year, samesite=lax, same idiom as
  pips-sound): written on every successful game entry (host start or
  guest join), prefills the landing input.
- GitHub Pages fallback: the build copies `dist/index.html` →
  `dist/404.html` so refresh at `/pips/<game>` boots the app.
- Route logic kept PURE where testable: segment↔game map + a boot
  decision function `(pathname, search, hasName) → action` with unit
  tests; the App glue stays thin.

## Non-goals
Preserving in-progress games across refresh; spectator URLs; per-screen
sub-routes; router libraries.

## Milestones
- M1 (spec 19): `src/state/route.ts` (map + boot decision + cookie
  helpers) + tests.
- M2 (spec 19b): App wiring (push on entry incl. guests, popstate guard,
  leave replaceState, deep-link boot, legacy picker replaceState),
  Landing prefill, build's 404 copy step.
- M3: live verification (URL per game, Back→shelf, confirm both
  branches via window.confirm override, refresh→pre-start, no-cookie→
  shelf, guest URL, legacy picker swap), review, docs, commit offer.

## Run budget
6 cycles (expect 2).
