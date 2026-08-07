# Roadmap

Previous charter (card-engine foundation) is complete — see
`docs/card-engine.md` and `docs/DEVLOG.md`'s wrap-up entry. This roadmap is
for the current charter (real Rummy) — see `CHARTER.md`.

## Next up
1. M5 — documentation (`docs/rummy.md`).

## Done (this charter)
- [cycle 7] M4b — `handCounts` on `RummyPublicState` (Part A, commit
  841696e); Rummy shelf tile + full host/guest/bot session in App.tsx
  using M2's generalized transport (Part B, commit 495c283). Verified
  with two real browser tabs, not mocks — live host-guest sync
  confirmed end to end, dice-game regression re-checked (Farkle).
  3 real defects found and fixed via direct code review and live
  testing: a stale-closure bug that broke the entire host-vs-human
  flow (host's PeerJS callbacks read React state instead of refs, so
  they permanently saw player ids as null), a missing join-routing
  path (no way to actually reach the Rummy guest flow from the shared
  "join with a code" field), and the guest never learning the host's
  display name (never part of the wire protocol).
- [cycle 6] M4a — `RummyTable`/`RummyResults` screen components, pure
  presentational, verified via a live browser mock-state check (reach-in
  hover, card selection, round/match-over panels all confirmed working)
  — commit 9f3bfac
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
- [cycle 5] M3 — `PlayingCard`/`CardBack` visual components (hand/meld/
  discard, opponent-fan/stock), own stylesheet, not wired into a screen
  yet; verified by a temporary demo render in-browser, no adversarial
  review (no game logic to attack) — commit 742c876

## Done (prior charter — card-engine foundation, see docs/DEVLOG.md for detail)
- M0-M6 — card-engine (cards/deck/rng/zones/turn-engine/sync/bot) + minimal
  Rummy proof harness + docs. 165 tests. Commits `0447171`..`7593e1c`.

## Cut / deferred
- Laying off onto existing melds — explicitly out of scope, see CHARTER.md
  Non-goals.
- Host migration/resume on disconnect — relies on existing generic PeerJS
  disconnect handling, no new logic built.
- Bot difficulty tiers — one strategy only.
