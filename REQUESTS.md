# Requests for the human

- [ ] 2026-08-09, Battleship wrap-up — **commit the charter**: the full
      Battleship implementation sits verified in the working tree
      (514 tests / tsc / build green, two clean reviews, full match
      live-verified). Say the word and it lands as one commit on `main`
      (+ push).
- [x] 2026-08-09, Battleship wrap-up — real audio: done — user supplied
      ship-hit / ship-miss / ship-destroyed mp3s; installed as
      ship-hit / ship-miss / ship-sunk. Placement still reuses
      `piece-drop` by design.

- [x] 2026-08-09, engine-core wrap-up (done — user approved; committed 41fa325)
      was:  — **commit the charter**: the
      `src/engine/` promotion sits verified in the working tree (renames
      staged, imports + docs modified, 481 tests / tsc / build green). The
      loop can't commit (project CLAUDE.md). Say the word and it lands as
      one commit on `main`.
- [x] 2026-08-09 (done — constraint bullet added to CLAUDE.md) — CLAUDE.md's card-engine constraint
      paragraph predates `src/engine/`; consider codifying: `src/engine/`
      must not import React, screens/components, card-engine, card-games,
      or games — it is the bottom layer. (CLAUDE.md is user-owned, so the
      loop didn't touch it.)
- [x] 2026-08-09 (done — promoted, spec 12) — `src/card-engine/bot.ts` (`runBotTurn`) is
      fully generic; promote it to `src/engine/` whenever the first
      non-card game grows a house bot.

- [x] 2026-08-08, Connect 4 wrap-up — real audio: done — user supplied a
      real disc-drop mp3; placeholder replaced.
- [x] 2026-08-08, Connect 4 wrap-up — commit the charter: done — user
      authorized commit + push after wrap-up.

- [x] 2026-08-07 (done 2026-08-09 — user approved "run the requests"; everything pushed to origin/main) — the card-engine charter is complete
      (all 6 milestones, 165 tests, 12 commits on `main`). Nothing was pushed
      to GitHub — this project's standing policy is to ask first. Say the
      word and I'll push everything (this run's commits plus the earlier
      landing/bot-difficulty work) to `origin/main`.
- [x] 2026-08-07 (obsolete — full Rummy and Phase 10 shipped in later charters) — for whenever you want to pick this
      back up: the next piece is full Rummy (melds/sets/runs/scoring/
      multiple rounds) plus wiring a card-game session into the live lobby
      UI — neither started in this run by design. `docs/card-engine.md` §5
      is the precise handoff: what exists, what doesn't, and the one
      non-obvious pattern (the stock-visible-to-nobody closure wrapper) the
      next implementation needs to reuse rather than reinvent.
