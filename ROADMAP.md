# Roadmap

Previous charter (card-engine foundation) is complete — see
`docs/card-engine.md` and `docs/DEVLOG.md`'s wrap-up entry. This roadmap is
for the current charter (real Rummy) — see `CHARTER.md`.

## Next up
1. M0b — integrate into the rules engine: extend `RummyAction`/
   `RummyPublicState` for melds/reach-in-with-index/going-out/stock
   recycling/multi-round match scoring, extend `state.ts`/`rules.ts`.
   Also changes the deal size from the M5-harness placeholder (7 cards,
   no starting discard) to the real design (10 cards, 1 flipped to start
   discard) — an intentional, documented change to existing code.
2. M1 — house-player bot strategy for Rummy (`card-engine/bot.ts` seam).
3. M2 — generalize `src/net/peer.ts` transport to be payload-generic;
   regression-verify the 4 existing games unaffected.
4. M3 — `PlayingCard` visual component matching the design handoff spec.
5. M4 — `RummyTable` screen + wiring (shelf tile, room/host/join flow,
   Results integration). Browser smoke test.
6. M5 — documentation (`docs/rummy.md`).

## Done (this charter)
- [cycle 1] M0a — pure meld classification, rank values, deadwood scoring —
  commit b0c5595

## Done (prior charter — card-engine foundation, see docs/DEVLOG.md for detail)
- M0-M6 — card-engine (cards/deck/rng/zones/turn-engine/sync/bot) + minimal
  Rummy proof harness + docs. 165 tests. Commits `0447171`..`7593e1c`.

## Cut / deferred
- Laying off onto existing melds — explicitly out of scope, see CHARTER.md
  Non-goals.
- Host migration/resume on disconnect — relies on existing generic PeerJS
  disconnect handling, no new logic built.
- Bot difficulty tiers — one strategy only.
