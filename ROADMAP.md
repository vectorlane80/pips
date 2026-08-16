# Roadmap

Charter: Uno — see `CHARTER.md`.

## Charter: Uno (2026-08-15) — in progress
- [x] M1 — Uno module (spec 34): 108-card deck, N-player (2-10) state/rules/
      bot, 68 tests. Oscar review: approve, no blockers (two nits, neither
      requiring action). 899 tests total / tsc / build green.
- [x] M1 cleanup (spec 34a) — both Oscar nits closed anyway (user: "I don't
      like leaving anything behind"): documented the stale turn/
      hasDrawnThisTurn fields, added a 50-trial × 300-action property test
      (every seat a bot, real deals, 2-10 players) proving stockCount/
      conservation/handCounts/wire-safety invariants generatively — zero
      rejections, zero violations across ~15,000 actions. 900 tests total.
- [x] M2 — Uno-call race mechanism (spec 34b): single-window invariant
      (`unoWindow: {playerId}|null`, not a record — enforced by the type
      itself), opens on every turn-ending branch at exactly 1 card for the
      ACTING player, destroyed by CALL_UNO (self or catch, not turn-gated)
      or the next player's first action. 25 new tests incl. the critical
      open→null→reopen sequence and sequential double-call rejection.
      Oscar review: approve, no blockers, one nit (dead-but-harmless
      code, left as-is deliberately). 925 tests total.
- [x] M3 — House rules structure (spec 34c): generic `UNO_HOUSE_RULE_DEFS`
      array + `resolveHouseRules()` overlay-defaults pattern, one real
      rule ("draw until you can play") confined entirely to DRAW_CARD's
      handler. 14 new tests. Oscar review: approve, no findings (traced
      the loop-termination proof, the rule-OFF regression equivalence,
      and houseRules survival across START_NEXT_ROUND/CALL_UNO/go-out
      directly against the code). 939 tests total.
- [ ] M4 — Screens + multi-seat wiring (split into 34d/34e/34f, matching
      this project's established screens-then-wiring pattern)
  - [x] 34d — UnoCardFace/UnoCardBack components. Mirrored Phase10Card's
        exact click/disabled mechanics and the wild-gradient technique
        verbatim. Caught and fixed one real deviation myself before
        landing: the implementer substituted Phase10's palette for the
        four solid face colors instead of Uno's actual locked brand
        colors (`#e11d2e/#eab308/#16a34a/#2f6fed` from the design
        prototype's `UNO_COLORS` constant) — corrected, wild gradient
        left untouched. tsc/build clean.
  - [x] 34e — UnoTable screen: N-player opponent seat rail, deck/discard,
        wild color picker, fanned hand, uncolored Uno-call button (self
        immediate / catch staggered 1s via `useCatchStagger`, re-keyed
        correctly on window→different-window). Oscar review: approve, no
        blockers, one forward-looking note on sound-branch coupling. 944
        tests / tsc / build green.
  - [x] 34f — UnoRoom/Results/RulesOverlay: house-rules toggle list
        (generic `UNO_HOUSE_RULE_DEFS.map()`, card+pill, no precedent
        existed so designed from scratch) and bot-reflex difficulty
        picker (Room.tsx pill convention), 10-slot seat list, results
        sorted descending (higher-score-wins, unlike MT's ascending
        pips). 944 tests / tsc / build green, verified directly.
  - [x] 34g — App.tsx/route/landing/README wiring: full PeerJS host/
        guest lifecycle mirroring Mexican Train (variable 2-10 seats,
        per-guest private-hand sendTo), plus the novel bot Uno-call
        reflex system (generation-counter timer invalidation, verified
        airtight by direct trace of every unoSessionRef mutation site).
        Oscar review: approve with caveats — one real-but-benign edge
        case (disconnect-while-vulnerable then replaced-with-bot could
        leave a stale reflex-scheduling gap), fixed immediately (one-
        line `unoWindowKeyRef` reset in `unoReplaceWithBot`). 947 tests
        / tsc / build green. Live-verified: 6-player match (host + 5
        bots, well past the old 4-player cap), skip/draw2/multi-draw
        all fired correctly, zero console errors.
- **Uno charter definition of done: reached.** All four milestones
  (module, call mechanism, house rules, screens+wiring) shipped and
  independently verified. Nothing has been committed or pushed this
  entire charter, per the standing no-auto-commit rule — commit/push
  authorization requested via REQUESTS.md + chat.

## Next up (after Uno)
- Lift the 2-player cap on Rummy/Phase 10/Dominoes seating using the
  Wahoo/Mexican Train multi-seat pattern (Mexican Train and Farkle
  already got this treatment — specs 25/25b — Rummy/Phase10/Dominoes
  are the remaining 2-player-only card/board games).

## Done (prior charter: Checkers + Mexican Train, Chess, various fixes)
- Chess (specs 27/27b/28/29/30) — full rules via chess.js, 3 bot tiers,
  slide animation. Mexican Train lifted to 2-8 (specs 25/25b), pacing +
  open-signals polish (spec 26). Landing shelf compaction (spec 24).
  Farkle final-round fix, Dominoes snake-overflow fix, dice roll-signal
  fix, lobby rework, rebrand — various un-spec'd interactive-session fixes
  landed and pushed directly (see git log / docs/DEVLOG.md for detail;
  not all interactive-session work got a spec file).

## Done (prior charter: Wahoo)
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
