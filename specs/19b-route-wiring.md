# Spec 19b: routing wiring (M2)

Modify ONLY `src/App.tsx`, `src/screens/Landing.tsx`, `package.json`
(build script), using `src/state/route.ts` (spec 19). Read route.ts
first.

## App.tsx

1. **Push on entry.** Every game-entry path pushes its URL exactly once:
   - Legacy: where the shelf's `onPickGame` creates the room AND where a
     legacy guest first receives a room state → `history.pushState({},
     '', gamePath(game))`. The in-room game picker (pickGame action
     reaching the host, and the guest receiving a state whose game
     changed) → `history.replaceState` with the new segment.
   - Engine hosts: inside each startXHost (rummy/phase10/battleship/
     dominoes/wahoo) right where the role is set.
   - Engine guests: inside each startXGuest at the same point.
   Factor a tiny `pushGameUrl(game)` / `replaceGameUrl(game)` pair —
   only pushState if the current pathname isn't already that game's
   path (guards double-push on rematch etc.).
2. **Name cookie.** `writeNameCookie(name)` at every entry point above
   (host + guest, legacy + engine). In the boot effect (below), seed
   the name state from `readNameCookie()` when the name is empty.
3. **popstate guard.** One `useEffect` (mounted once) adding a popstate
   listener via refs (avoid stale closures):
   - Determine "live game": legacy → roomRef.current && screen not in
     {'room'}; engine → any started/role with a view whose stage/round
     is active (battleship stage !== 'over' is still live — leaving
     mid-match is what we guard; results screens count as NOT live).
   - If live: `window.confirm('Leave the game?')`; decline →
     `history.pushState({}, '', gamePath(currentGame))` and return.
   - Accept (or not live): full `resetToEntry()` (which must NOT touch
     history itself when invoked from popstate — see 4).
4. **Leave semantics.** `resetToEntry` gains an optional
   `{ fromPopstate?: boolean }`: when called from UI Leave buttons it
   ends with `history.replaceState({}, '', '/pips/')`; from popstate it
   leaves history alone (the browser already moved).
5. **Deep-link boot.** On mount, run `decideBoot(location.pathname,
   location.search, !!readNameCookie())`:
   - 'join' → existing join flow (current ?join handling moves here if
     it lives elsewhere — unify, don't duplicate).
   - 'host' → set name from cookie, then invoke that game's shelf
     handler (startXHost / legacy room creation) — AFTER replacing the
     URL state so history is [.../pips/<game>] with a sane base: use
     replaceState (a deep link has no /pips entry beneath; Back exits
     the site, which is correct for a deep link).
   - 'shelf-needs-name' or 'shelf' → normal landing (URL: replaceState
     to '/pips/' for shelf-needs-name so the stale game path doesn't
     linger).

## Landing.tsx

Prefill: the name input's value already comes from App state — no
change needed beyond App seeding it from the cookie. Only touch this
file if the seeding needs a prop change; otherwise leave it.

## package.json

Build becomes `tsc -b && vite build && cp dist/index.html dist/404.html`
(GH Pages SPA fallback).

## Verify (once)

npx tsc -b --noEmit; npm test (694); npm run build — AND assert
`dist/404.html` exists (ls it).

## Forbidden

Router deps; touching game modules/screens beyond the two named files;
git.

## Report
(1) commands + tallies; (2) entry points wired (list them); (3)
deviations or "no deviations".
