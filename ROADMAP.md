# Roadmap

Prior charters (card-engine foundation, real Rummy) are complete — see
`docs/card-engine.md`, `docs/rummy.md`, `docs/DEVLOG.md`'s wrap-up entries.
This roadmap is for the current charter (Phase 10) — see `CHARTER.md`.

## Next up
- [ ] M0 (prep) — widen `card-engine/cards.ts` `Suit`/`Rank` to `string`
- [ ] M0a — pure Phase 10 rules: deck, phase table, set/run/color classifiers
- [ ] M0b — full rules engine wired onto card-engine (draw/lay/hit/discard/
      skip/going-out/recycling/scoring/phase advancement/match end)
- [ ] M1 — house-player bot strategy
- [ ] M3 — Phase 10 card-visual components
- [ ] M4 — Phase10 screen + App.tsx/Landing.tsx wiring
- [ ] M5 — `docs/phase10.md`

(M2 folded away — `peer.ts` is already generic from Rummy's charter.)

## Done (this charter)
(none yet)

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
