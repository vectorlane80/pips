# Spec 19d: routing review fixes

1. src/state/route.ts: writeNameCookie must encodeURIComponent the
   value and readNameCookie must decodeURIComponent; add route.test.ts
   cases for a name containing ';', '=', and unicode (round-trip via
   the injectable accessor).
2. src/App.tsx boot: when decideBoot returns plain 'shelf' but
   location.pathname is neither the base ('/pips', '/pips/', '/')
   nor a valid game path, replaceState to '/pips/' so junk URLs
   (/pips/not-a-game) don't linger in the address bar.
Verify: tsc, npm test, build. Report tallies + deviations.
