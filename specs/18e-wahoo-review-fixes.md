# Spec 18e: Wahoo review fixes

Three findings from the wiring review. Modify ONLY
`src/screens/WahooTable.tsx`, `src/screens/WahooTable.css`, and
`src/App.tsx`.

1. **Destination collision (major).** Two legal moves can target the
   same hole (proven in oscar.test.ts): e.g. an `advance` landing on a
   corner while a center `exit` targets the same corner. Fix with
   optional marble-first selection in WahooTable:
   - Group `legalMoves` by destination hole. Unique-destination targets
     behave exactly as today (click executes).
   - For a shared destination, render it in a distinct "contested"
     style; clicking it does NOT execute — instead it highlights the
     candidate marbles (selectable rings). Clicking a highlighted
     marble executes THAT marble's move to the contested hole.
     Clicking any ringed marble at any time also works as a filter:
     `selectedMarbleIdx` state narrows visible targets to that marble's
     moves; clicking elsewhere on the board clears the selection.
   - Keep it minimal: one `selectedMarbleIdx: number | null` state, no
     new components.
2. `src/App.tsx` — `wahooReplaceWithBot` must guard against
   double-invocation via a REF of the dropped list (mirror the other
   ref-guard idioms), not the `wahooDropped` state value.
3. `src/App.tsx` — `resetToEntry` must also reset `wahooBotBusyRef` to
   false (the one missing ref in the teardown list).

Verify: `npx tsc -b --noEmit`, `npm test` (all green incl. the two new
oscar probes), `npm run build`. Report tallies + deviations.
