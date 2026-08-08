# Roadmap

Charter: Deal-intro animation (Rummy + Phase 10) — see `CHARTER.md`.

## Next up
- [ ] M2 — wire into RummyTable.tsx
- [ ] M3 — wire into Phase10Table.tsx

## Done (this charter)
- [cycle 1] M1 — `DealIntro` component + `computeDealFlights` helper.
  Review found two real bugs (a backgrounded-tab timer/rAF race, and a
  live prop-desync when the bot acts during the intro), both fixed and
  re-verified. 469 tests total.

## Cut / deferred
- More than 2 seats — neither current game needs it.
- Reconnect/interrupt handling — neither game supports mid-hand reconnect
  at all, so there's no case to handle.
- A skip control — not requested by the design.
