# Roadmap

Prior charters (card-engine foundation, real Rummy) are complete — see
`docs/card-engine.md`, `docs/rummy.md`, `docs/DEVLOG.md`'s wrap-up entries.
This roadmap is for the current charter (Phase 10) — see `CHARTER.md`.

## Next up
- [ ] M3 — Phase 10 card-visual components (in flight)
- [ ] M4 — Phase10 screen + App.tsx/Landing.tsx wiring
- [ ] M5 — `docs/phase10.md`

(M2 folded away — `peer.ts` is already generic from Rummy's charter.)

## Done (this charter)
- [cycle 3] M1 — `src/card-games/phase10/bot.ts`, 23 tests. Review found
  a real engine soft-lock (stock empty + lone Skip on discard = no legal
  move for anyone) — fixed in `rules.ts`, not papered over in the bot.
  457 tests total.
- [cycle 2] M0b — `src/card-games/phase10/{scoring,state,rules}.ts` +
  33-test integration harness: full rules engine (draw/lay-phase/hit/
  discard/skip/going-out/stock-recycling/scoring/phase-advancement/
  match-end) wired onto card-engine. No real defects found by review.
  433 tests total.
- [cycle 1] M0 (prep) — widened `card-engine/cards.ts` `Suit`/`Rank` to
  `string`, zero behavior change, existing tests unmodified and green.
  M0a — `src/card-games/phase10/{deck,phases,classify}.ts`: 108-card deck
  builder, 10-phase requirement table, pure set/run/color-group
  classifiers with wild substitution + partition search. One real
  Skip-card-leak bug found by review and fixed (see docs/DEVLOG.md).

## Done (prior charters — see docs/DEVLOG.md for detail)
- Card-engine foundation (M0-M6): cards/deck/rng/zones/turn-engine/sync/bot
  + minimal Rummy proof harness + docs. 165 tests.
- Real Rummy (M0-M5): full meld/reach-in/scoring/bot/UI/transport-
  generalization/docs. 252 tests total, playable end to end.

## Cut / deferred
- Host migration/resume on disconnect — relies on existing generic PeerJS
  disconnect handling, no new logic built (same as Rummy).
- Bot difficulty tiers — one strategy only.
- More than 2 players.
