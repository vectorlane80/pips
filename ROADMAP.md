# Roadmap

Charter: Engine-core promotion — see `CHARTER.md`.

## Next up
(none — charter complete in cycle 1; commit deferred to user, see REQUESTS.md)

## Done (this charter)
- [cycle 1] M1 — `src/engine/` created; sync/turn-engine/rng (+tests) moved
  via `git mv` (pure renames, zero content change); 15 importers updated;
  `docs/card-engine.md` + README refreshed. tsc/481 tests/build clean,
  re-run independently by the lead. Review (sonnet, diff-scoped): CLEAN —
  no stale references, no config/alias assumptions on the old layout.
  Implementer: deepseek:flash (~$0.19), spec followed verbatim, report
  accurate on re-verification. Spec: `specs/11-engine-core-promotion.md`.

## Cut / deferred
- Grid engine / path engine — investigated and rejected for now; abstract
  when a second game of each family exists (Battleship builds directly on
  `src/engine/` sync; Wahoo on rng + turn-engine).
- `bot.ts` promotion to `src/engine/` — generic (imports only sync) but
  outside the approved scope; promote when a non-card game wants it.

## Done (prior charters)
- Connect 4 (2026-08-08): rules, bot, table, wiring — committed.
- Card engine + Rummy + Phase 10 (2026-08-05..07) — committed.
