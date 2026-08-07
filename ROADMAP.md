# Roadmap

## Next up
1. M5 — Rummy integration harness (test-only, not full Rummy, not UI). Spec locked.
2. M6 — `docs/card-engine.md`.

## Done
- [cycle 1] M0 — card-engine cards+deck+rng+vitest — commit 0447171
- [cycle 2] M1 — card-engine zones — commit 95d9b04
- [cycle 3] M2 — card-engine turn-engine — commit b3f58b9
- [cycle 4] M3 — card-engine sync (host-authoritative pipeline) — commit ce47e05
- [cycle 5] M4 — house-player seam — commit 7281cbe

## Cut / deferred
- Full Rummy rules (melds, scoring, multiple rounds, UI) — explicitly out of
  scope for this charter; next task after this one lands.
- Wiring card games into the live lobby/App.tsx screen-routing flow — the sync
  module is proven via tests/harness, not via a playable UI in this charter.
