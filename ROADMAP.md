# Roadmap

Charter: Wahoo — see `CHARTER.md`.

## Next up
(none — wahoo charter complete; commit offered)
- Next natural charter: lift the 2-player cap on Rummy/Phase 10/
  Dominoes/Farkle-style seating using the Wahoo multi-seat pattern.

## Done (this charter)
- [wahoo] specs 18/18b–18e — generated board (proven symmetry), full
  rules incl. user's center/triple-six corrections, multi-guest lobby
  wiring + spectator block, contested-target fix. 664 tests, module
  CLEAN + wiring approve, live 4-seat verification.

## Done (prior charter: Dominoes)
- [dominoes] specs 17/17a–17h — module (standardized All Fives scoring,
  common draw rule), snake layout with flush corners, screens with
  domino-back deal intro, App wiring. 597 tests, two approve reviews,
  live-verified vs bot through round transition. ~$0.85 implementer cost.

## Done (prior charter: containers prep)
- [containers] spec 16 — Zone/deck helpers generic over id-bearing
  items, Card default, zero call-site churn. 534 tests. Review CLEAN.

## Done (prior charter: Battleship variants)
- [variants] specs 15/15a/15b/15c — standard / make-it-take-it /
  free-for-all, host-picked in the room, validator-enforced, bot loop
  free-mode cadence with starvation fix. 523 tests. Streak + free
  live-verified (chain status, turnless racing, full FFA match to 5–0).
  Review: approve, no blockers.

## Done (prior charter: Battleship)
- [cycle 1] M1 — game module (state/rules/bot + 25 tests incl. snapshot
  no-leak). Two implementer test-harness bugs lead-diagnosed, fixed via
  spec 13a. Review (sonnet, adversarial, live-repro rule): CLEAN on leaks;
  8-test oscar.test.ts kept in suite; one informational finding
  (playerId membership is the wiring layer's guard) carried into spec 14b.
- [cycle 1] M2 — screens (spec 14a: Room/Table/Results/RulesOverlay + CSS,
  ship-hit/miss/sunk sound registry) + App/Landing wiring (spec 14b: BS-
  prefix, bot loop, guest snapshot broadcast, onAction peer guard).
- [cycle 1] M3 — full host-vs-bot match live-verified in the browser
  (placement manual + randomize, rotate, hunt/target bot, sunk reveals,
  pills, 5–4 win, results, rematch reset; zero console errors). UI/wiring
  review (sonnet): approve, no blockers; 320px nit measured and accepted.
  docs/battleship.md + README updated. 514 tests / tsc / build green.

## Cut / deferred
- Grid engine — still no; index math lives in the game module.
- Real hit/miss/sunk audio — placeholders shipped; list delivered to user.
- Two-browser guest session live test — snapshot-level tests + review
  stand in (established repo practice); the wire path is byte-identical
  to Rummy's.

## Done (prior charters)
- Engine-core promotion (2026-08-09) — committed 41fa325/12e3d22, pushed.
- Connect 4 (2026-08-08); Card engine + Rummy + Phase 10 (08-05..07).

## Charter: Checkers + Mexican Train (2026-08-10) — in progress
- [x] M1 checkers module — spec 20, 35 tests (731 total), Oscar CLEAN.
- [x] M2 checkers screens + wiring — specs 21/21b, live 3-game match vs bot,
      Oscar visual review (ring fix applied). 732 tests.
- [x] M3 mexican train module — spec 22, 39 tests (771 total), prototype
      deadlock/deal bugs fixed by design. Oscar review in flight.
- [x] M4 mexican train screens + wiring — specs 23/23b + HostHandle.sendTo,
      live 3-round soak, Oscar code APPROVE + visual review (track-height
      and star fixes applied). 772 tests.
- [x] M5 landing count label — folded into 21b ("11 games").
