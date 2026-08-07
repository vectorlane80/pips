# Roadmap

## Next up
1. M0 — `card-engine/cards` + `card-engine/deck`: Card identity, standard deck
   creation, host-seeded shuffle, deal/draw. Add vitest as the test runner.
2. M1 — `card-engine/zones`: Hand, DiscardPile, PlayerZone, PublicZone, move
   card between zones, reveal/hide, recycle.
3. M2 — `card-engine/turn-engine`: generic turn state machine.
4. M3 — `card-engine/sync`: action envelope, public/private split, revision
   numbers, snapshot request/response, host-authoritative pipeline.
5. M4 — house-player seam: generic bot interface + trivial stub.
6. M5 — Rummy integration harness (test-only, not full Rummy, not UI).
7. M6 — `docs/card-engine.md`.

## Done
(none yet)

## Cut / deferred
- Full Rummy rules (melds, scoring, multiple rounds, UI) — explicitly out of
  scope for this charter; next task after this one lands.
- Wiring card games into the live lobby/App.tsx screen-routing flow — the sync
  module is proven via tests/harness, not via a playable UI in this charter.
