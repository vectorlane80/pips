# Spec 25b — Mexican Train 2–8: screens, wiring, copy

Prereq: spec 25 (module now takes 2–8 seats, hands scale, blocked = seat
count). You own edits to EXACTLY:

- `src/App.tsx`
- `src/screens/MexicanTrainRoom.tsx`
- `src/screens/MexicanTrainTable.tsx` (audit for 4-seat assumptions; fix)
- `src/screens/MexicanTrainResults.tsx` (audit; likely fine)
- `src/screens/MexicanTrainRulesOverlay.tsx` (copy only)
- `src/screens/Landing.tsx` (one string)
- `README.md` (one clause)

Changes, locked:

1. **Room**: MAX_SEATS 8, Start enabled at ≥ 2 seated (bots optional, not
   forced). Replace the "seats exactly four" hint with:
   "Two to eight seats — bots can fill any of them." Seat slots render 8.
2. **App**: `MT_SEAT_INKS` grows to 8 distinct chunky-palette colors (keep
   the existing first four, then `#9333ea`, `#0fb5a0`, `#f97316`,
   `#64748b`); lobby join cap 8 with the same spectator/full rejections;
   `mtStart` requires 2–8 seated and passes the actual seat array;
   everything else (bot loop, auto-PASS, per-guest sendTo, replace-with-
   bot) is seat-count agnostic — AUDIT each for a literal 4 and fix any.
3. **Table**: lanes and seat cards must render from `seatOrder`/`trains`
   dynamically — audit for hardcoded p0–p3 or length-4 assumptions and
   fix. With 8 seats the rail holds 8 cards; keep the narrow-screen
   collapse working (no fixed heights).
4. **Rules overlay** intro becomes: "Double-12 set, two to eight players —
   hands scale with the table (16 tiles at two down to 9 at eight). Each
   round starts from a double 'engine' — everyone builds their own train
   off it, and anyone can play on the shared Mexican train. Lowest total
   pips after all thirteen rounds wins." Rule lines unchanged.
5. **Landing** Mexican Train note: "2–8 players". **README**: the games
   paragraph's "Mexican Train seats exactly 4" clause becomes
   "Mexican Train seats 2–8".

Verify: `npx tsc -b --noEmit` silent; `npm test` all green; `npm run build`
ok. Report every 4-assumption you found and fixed, plus verbatim outputs.
