# Spec 21b — Checkers wiring: App, route, landing (+ shelf count label)

You own edits to EXACTLY these files (no new files):

- `src/App.tsx`
- `src/state/route.ts`
- `src/state/route.test.ts`
- `src/screens/Landing.tsx`

Nothing else. The Checkers screens and module already exist and are green.

## Method

Checkers is a 2-player engine game wired EXACTLY like Battleship, except its
board is public (no private board state — `privateStates` are empty objects,
so no PLACE-stage private plumbing). Work site by site: grep App.tsx for
`battleship`/`Battleship`/`BS-` and mirror EVERY site for checkers (screen
imports, app-stage union members, state refs, host create/join, guest join,
action senders, snapshot broadcast, bot loop, rematch, leave/results, route
push). Where Battleship has placement-specific logic, Checkers has none —
skip it. Keep the existing code style; no refactors.

Specifics:

1. **Code prefix**: `CK-` (mirror how `BS-`/`WH-`/`DM-` prefixes are
   generated and parsed — grep for the prefix table/branch and extend it).
2. **Route**: in `src/state/route.ts` add `'checkers'` to `RoutedGame` and
   `GAME_SEGMENTS` (segment string `checkers`). Extend `route.test.ts` with
   the same cases the other games get (gamePath, gameFromPath, decideBoot
   host deep-link) — mirror an existing game's test lines.
3. **App stages**: host + guest checkers stages mirroring battleship's
   (room/table/results). `pushGameUrl('checkers')` at the same entry points
   battleship pushes its own; include checkers stages in `liveGameNow()` so
   the Back-guard covers a live match (lobby/room and results stages
   excluded, same as others).
4. **Host session**: `createCheckersGame([hostId, otherId], seed)` at start
   (seed from the same source battleship uses). Actions via
   `applyCheckersAction` + broadcast with `deriveSnapshot` exactly like
   battleship's action handler. Guests send `{type:'MOVE',from,to}` intents.
5. **Bot loop**: mirror battleship's bot effect using
   `makeCheckersBotStrategy(game.rng)` + `runCheckersBotTurn`, with the same
   pacing delay battleship uses. The bot acts whenever it is the current
   player in stage 'play' (including chain continuations — the state after a
   chain jump still has the bot as current player, so the same effect
   re-fires; add the chain state to the effect's dependency signature if the
   existing signature wouldn't re-trigger, e.g. include
   `publicState.chainCell` and `publicState.lastMove`).
6. **Game-end advance**: when stage is `'gameEnd'` and there is no
   matchWinnerId, the HOST auto-issues `{type:'NEXT_GAME'}` after the same
   delay pattern dominoes uses for `START_NEXT_ROUND` (grep App.tsx:~1680
   for `roundEnd`). Stage `'over'` → results screen, mirroring battleship's
   transition.
7. **Table props**: pass `names`, `colors` (the same per-player color map the
   other engine games derive — grep how Wahoo builds seat colors),
   `connection`, `notice`, `publicState`, `onMove` (host applies /guest
   sends), `onOpenRules: () => {}` (the table manages rules locally),
   `onLeave` (same leave/reset flow as battleship).
8. **Results**: mirror BattleshipResults wiring (rematch = host creates a
   fresh `createCheckersGame` with a new seed, same seats; back-to-shelf =
   the shared reset).
9. **Landing tile**: in `Landing.tsx`, add a Checkers tile after Wahoo,
   hardcoded like the Rummy/Battleship/Wahoo tiles: title "Checkers", blurb
   "Jump the diagonals, crown a king", note "2 players", background
   `#b45309` when ready. New prop `onPickCheckers` mirroring `onPickWahoo`
   (or however Wahoo's tile calls back — read it first), wired in App.tsx to
   the checkers host flow.
10. **Shelf count label**: in Landing.tsx, when a name IS entered, the label
    row's right-hand span (currently only rendered when `!ready` as "type a
    name to start one") instead shows `"<n> games"` where n is the number of
    tiles on the shelf — count it from what's rendered (GAMES.length + the
    number of hardcoded tiles, kept as a simple literal-derived expression,
    not a magic number). Style: same 12px/500 faint span.

## Verify before reporting

`npx tsc -b --noEmit` silent; `npm test` green (731 + your new route tests);
`npm run build` succeeds. Report: files touched, each battleship wiring site
you mirrored (brief list), test count, verbatim final command outputs. If
anything is red or a site doesn't map cleanly, STOP and report honestly
rather than improvising an architecture change.
