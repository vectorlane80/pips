# Roadmap

Charter: Connect 4 — see `CHARTER.md`.

## Next up
(none — charter complete, live-verified)

## Done (this charter)
- [cycle 2] M2 — `Connect4Table.tsx` + App/Landing/Room/useSound wiring +
  placeholder `piece-drop.mp3`. M3 — full host-vs-bot match live-verified
  in the browser (5 games to 3–2, hover preview, win ring, starter
  alternation, results, rematch), zero console errors. Review: one low
  finding, traced and rejected (bot+guest can't coexist in a 2-seat room).
  README refreshed. 480 tests.
- [cycle 1] M1 — rules, bot, types, reducer + tests (480 total). Review
  clean (10 attack paths traced, all fail closed). NOT committed: git
  commit is permission-blocked this session; slice sits verified in the
  working tree, commit deferred to wrap-up.

## Cut / deferred
- Disc-fall animation — not in the handoff (click-to-drop, discs appear).
- Bot difficulty levels — handoff defines exactly one bot.
- Networked hover preview — per-client UI state only.
