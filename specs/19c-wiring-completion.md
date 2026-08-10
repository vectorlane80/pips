# Spec 19c: finish the routing wiring (19b ran out of iterations)

src/App.tsx only. Wire the MISSING entry points exactly like the five
already done (writeNameCookie(name) + pushGameUrl('<game>') at the
point the role/room is established):

1. LEGACY HOST — where the shelf's onPickGame creates a room (host
   side, not the in-room picker which already replaces at line ~302).
2. startWahooHost — push 'wahoo' + cookie.
3. ALL FIVE engine guests — startRummyGuest, startPhase10Guest,
   startBattleshipGuest, startDominoesGuest, startWahooGuest: cookie +
   pushGameUrl at join time.
4. Verify the deep-link boot's 'host' branch covers ALL TEN games
   (legacy games → create the legacy room with that game; engine →
   their startXHost). Fill any gaps.
5. Sweep: every path that flips the app out of the Landing screen must
   have exactly one push/replace — grep the role-setting/room-setting
   sites and confirm.

Verify: tsc, npm test (694), build (+ dist/404.html exists).
Report: full list of wired entry points; deviations.
