# Roadmap

## Next up
1. M3 — `card-engine/sync`: action envelope, public/private split, revision
   numbers, snapshot request/response, host-authoritative pipeline. Spec locked.
2. M4 — house-player seam: generic bot interface + trivial stub. Spec locked.
3. M5 — Rummy integration harness (test-only, not full Rummy, not UI). Spec locked.
4. M6 — `docs/card-engine.md`.

## Done
- [cycle 1] M0 — card-engine cards+deck+rng+vitest — commit 0447171
- [cycle 2] M1 — card-engine zones — commit 95d9b04
- [cycle 3] M2 — card-engine turn-engine — commit b3f58b9

## Cut / deferred
- Full Rummy rules (melds, scoring, multiple rounds, UI) — explicitly out of
  scope for this charter; next task after this one lands.
- Wiring card games into the live lobby/App.tsx screen-routing flow — the sync
  module is proven via tests/harness, not via a playable UI in this charter.
