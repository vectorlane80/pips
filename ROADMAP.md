# Roadmap

Previous charter (card-engine foundation) is complete — see
`docs/card-engine.md` and `docs/DEVLOG.md`'s wrap-up entry. This roadmap is
for the current charter (real Rummy) — see `CHARTER.md`.

## Next up
1. M3 — `PlayingCard` visual component matching the design handoff spec.
2. M4 — `RummyTable` screen + wiring (shelf tile, room/host/join flow,
   Results integration). Browser smoke test.
3. M5 — documentation (`docs/rummy.md`).

## Done (this charter)
- [cycle 1] M0a — pure meld classification, rank values, deadwood scoring —
  commit b0c5595
- [cycle 2] M0b — melds/reach-in/going-out/recycling/multi-round scoring
  wired into the rules engine; deal size 7→10 + starting discard flip;
  4 real defects (permanent deadlock, 2 host crashes, non-participant
  START_NEXT_ROUND) + 2 test-quality gaps found by review and fixed —
  commit b8fe7d0
- [cycle 3] M1 — house-player bot strategy (greedy meld-seeking,
  connectivity-based discard, stock-vs-discard draw decision); 3 real
  defects (livelock, crash-on-empty-hand, greedy-meld stranding a
  guaranteed win) + 3 test-quality gaps found by review and fixed —
  commit 4fc3752
- [cycle 4] M2 — generalized `src/net/peer.ts` to `<TState, TAction>`;
  pure type-level change, no review needed (mechanical, verified by
  typecheck + a browser smoke test of Farkle) — commit be1816d

## Done (prior charter — card-engine foundation, see docs/DEVLOG.md for detail)
- M0-M6 — card-engine (cards/deck/rng/zones/turn-engine/sync/bot) + minimal
  Rummy proof harness + docs. 165 tests. Commits `0447171`..`7593e1c`.

## Cut / deferred
- Laying off onto existing melds — explicitly out of scope, see CHARTER.md
  Non-goals.
- Host migration/resume on disconnect — relies on existing generic PeerJS
  disconnect handling, no new logic built.
- Bot difficulty tiers — one strategy only.
