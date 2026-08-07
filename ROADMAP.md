# Roadmap

## Next up
Charter complete — all 6 milestones shipped. Next task (separate charter):
full Rummy (melds/sets/runs/scoring/multiple rounds) + wiring a card-game
session into the live lobby (App.tsx screen routing, net/peer.ts transport).
See docs/card-engine.md §5 for exactly what exists vs. what's needed.

## Done
- [cycle 1] M0 — card-engine cards+deck+rng+vitest — commit 0447171
- [cycle 2] M1 — card-engine zones — commit 95d9b04
- [cycle 3] M2 — card-engine turn-engine — commit b3f58b9
- [cycle 4] M3 — card-engine sync (host-authoritative pipeline) — commit ce47e05
- [cycle 5] M4 — house-player seam — commit 7281cbe
- [cycle 6] M5 — Rummy integration harness — commit 5be1100
- [cycle 6] M6 — docs/card-engine.md — commit 7593e1c

## Cut / deferred
- Full Rummy rules (melds, scoring, multiple rounds, UI) — explicitly out of
  scope for this charter; next task after this one lands.
- Wiring card games into the live lobby/App.tsx screen-routing flow — the sync
  module is proven via tests/harness, not via a playable UI in this charter.
