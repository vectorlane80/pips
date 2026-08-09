# Spec 17f: finish the dominoes wiring (spec 17e ran out of iterations)

Two remaining compile errors; finish exactly per spec 17e:

1. `src/screens/Landing.tsx` was never edited. Add the fourth hardcoded
   tile after Battleship (same structure): `onClick={onPickDominoes}`,
   title "Dominoes", color `#5b5bd6`, blurb "Match ends, bank the
   fives.", meta "2 players"; and add `onPickDominoes: () => void` to
   the props beside `onPickBattleship`.

2. `src/App.tsx:1269` — `resolvedDominoesOpponentId` is declared but
   unused. Look at how the RummyTable call site consumes
   `resolvedRummyOpponentId` (opponent name/color/props derivation) and
   wire `resolvedDominoesOpponentId` into the DominoesTable call site the
   same way (it is needed by the table props that reference the opponent;
   do not just delete it unless the rummy pattern genuinely derives
   nothing from it — mirror rummy exactly).

Touch ONLY those two files. Verify: `npx tsc -b --noEmit` clean,
`npm test` (597 green), `npm run build`. Report commands + tallies +
deviations.
