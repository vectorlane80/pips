# Devlog

Loop started 2026-08-06. Task: reusable card-game foundation (see CHARTER.md).
Pre-approved, unattended — implementer is DeepSeek CLI, reviewer is an Opus
sub-agent (user's explicit routing override for this run).

## Cycle 1 — 2026-08-06/07
- **Shipped:** M0 — `src/card-engine/{cards,deck,rng}.ts` + tests, vitest wired
  up as the project's test runner (commit `0447171`).
- **Verification:** re-ran `npx tsc -b --noEmit`, `npm test`, `npm run build`
  myself after DeepSeek's report, not just read its output. Read every source
  file line by line against the spec (exact match).
- **Review:** Opus sub-agent ran genuinely adversarial checks (60k-op
  conservation fuzz, byte-for-byte RNG comparison, chi-square fairness/
  uniformity tests, 12 mutation tests). Verdict: implementation correct, but
  the *tests* were weak — a biased Fisher-Yates (`j = rand*i` instead of
  `rand*(i+1)`) and an RNG algorithm drift would both pass the original 30
  tests. Fixed with a permutation-frequency fairness test and a golden-value
  RNG test.
- **Incident:** the golden RNG value I sourced from the review report for the
  fix spec was wrong in its 3rd digit-string (`0.5766275967937894` — does not
  match any deterministic continuation of the verified-correct first two
  values). DeepSeek caught this itself mid-task by re-deriving the value
  empirically through the real toolchain rather than trusting the spec's
  literal number, used the correct value, and flagged the discrepancy in its
  report. I independently re-verified with a fresh `node -e` before accepting
  either number. **Lesson:** even a review-report's own stated evidence needs
  independent re-verification before it's baked into a downstream spec as a
  "given" constant — one more link in the chain, one more chance for drift.
- **Incident:** the fix-spec's mutation-test step (deliberately break the
  shuffle, confirm the new test fails, revert) hit DeepSeek's 25-tool-round
  session cap mid-step and returned with `deck.ts` left in the **deliberately
  broken** state (`git status` showed it untracked, so `git diff` against HEAD
  showed nothing — the danger of verifying an uncommitted new module). Caught
  by reading the file directly rather than trusting "task complete." Fixed by
  hand, then independently reproduced the mutation-catches-the-bug proof
  myself (break it, confirm 1 test fails as expected, revert, confirm 32/32
  green again) before committing. **Lesson:** commit a new module right after
  its first successful independent verification, *before* dispatching any
  follow-up work against it — an untracked multi-file diff is much harder to
  audit for "did the last task actually leave this clean" than a tracked one.
- **Continue?** Yes — on track, M0 solid, M1 spec already drafted and locked
  in scratch, ready to dispatch next cycle.

## Cycle 2 — 2026-08-07
- **Shipped:** M1 — `src/card-engine/zones.ts` (generic `Zone` shape underlying
  Hand/DiscardPile/PlayerZone/PublicZone + move/recycle ops) + tests
  (commit `95d9b04`). Committed *immediately* after independent verification,
  before dispatching the fix round — applying cycle 1's lesson.
- **Verification:** re-ran the full ladder myself; read the real implementation
  line by line against the spec.
- **Review:** Opus found a genuine conservation-breaking bug — `removeCardsById`
  reconstructed its `removed` array by re-mapping over the caller's raw
  `cardIds`, so a duplicated id in the request (e.g. `moveCards(hand, discard,
  ['c1','c1'])`) minted a second reference to the same card, breaking the "no
  card duplicated or lost" invariant this whole layer exists to guarantee.
  Also flagged three test-coverage gaps (a shared-array-reference leak in
  `setZoneVisibility`, an untested `recyclePile` boundary, an unverified
  shuffle-callback-argument claim) — none were live bugs, but none had a test
  that would catch a regression either.
- I reproduced the duplication bug myself before writing the fix spec (own
  `npx tsx` repro, not just trusting the review's pasted output), locked a
  one-line fix (dedupe the id list) plus 5 regression tests, dispatched, then
  independently re-ran my own original repro command again post-fix to
  confirm — went from 2 phantom cards to 1 correct card.
- **Lesson carried forward:** every future zones/sync milestone that accepts a
  caller-supplied list of card ids (which, per the charter, will include lists
  assembled by another peer over the network once Rummy is wired up) needs a
  duplicate-id test as standard practice, not just a "happy path" test — this
  is exactly the kind of input a remote peer can trivially send, malicious or
  not (e.g. a double-click bug in some future UI).
- **Continue?** Yes — M0 and M1 both solid and committed. M2 (turn-engine) and
  M3 (sync) specs are already locked in scratch; dispatching M2 next.

## Cycle 3 — 2026-08-07
- **Shipped:** M2 — `src/card-engine/turn-engine.ts` (generic turn-order state
  machine) + tests (commit `b3f58b9`).
- **Verification:** full ladder re-run myself; read the implementation line by
  line against spec (exact match — the modulo wrap formula, the `turnNumber`
  bookkeeping rules, all 7 functions).
- **Review:** Opus fuzzed the arithmetic extremely hard (an independent
  rotating-array reference model compared against the real module across 4000
  operations at 8 different player counts, a 5000-op turnNumber-drift fuzz, 25
  mutation tests) and could not find an implementation bug. What it did find:
  `skipNext`'s test assertions only checked 3 of the 5 returned fields, so a
  mutant that silently flipped the returned `direction` field passed all 93
  tests untouched — I reproduced this myself before locking the fix. Also
  found every length-sensitive test used the same player count (3), leaving a
  blind spot for other lengths.
- Fixed with full-object assertions on `skipNext`'s result plus new coverage
  at 1, 2, and 5 players. DeepSeek's fix task completed cleanly this time
  (no tool-round cap issue like cycle 2) — mutation-tested its own fix,
  reverted, re-verified — and I independently re-ran the whole ladder plus
  read the restored file by eye before committing, same discipline regardless
  of how clean the report looked.
- **Lesson carried forward:** "assert only the fields the test happens to care
  about" is a recurring test-weakness pattern across all three milestones so
  far (M0's shuffle tests, M1's array-reference checks, now M2's per-field
  assertions) — worth calling out explicitly in future fix specs: prefer a
  full `toEqual` against the whole expected object over cherry-picked field
  assertions, unless there's a specific reason not to (e.g. deliberately
  ignoring a field that's expected to vary).
- **Continue?** Yes — M0, M1, M2 all solid and committed (99 tests). M3
  (sync), M4 (bot seam), and M5 (Rummy harness) are all already spec'd and
  locked in scratch. Dispatching M3 next.

## Cycle 4 — 2026-08-07
- **Shipped:** M3 — `src/card-engine/sync.ts` (host-authoritative action
  pipeline, public/private state split, revision numbers, reconnect
  snapshots) + tests (commit `ce47e05`). This is the trust-boundary module —
  the one that decides whether a player's hand can leak to another peer.
- **Verification:** full ladder myself; read the implementation against spec
  (exact match on first pass).
- **Review:** Opus went at this one hardest, appropriately — 3-player leak
  hunt via recursive `Reflect.ownKeys` walk + object-identity cross-check
  (no leak found), 12 mutation tests (all caught). Found no actual
  cross-player leak, but found 4 real trust-boundary defects: (1)
  `deriveSnapshot` did a raw bracket lookup on a caller-supplied `playerId`,
  so `deriveSnapshot(session, 'constructor')` returned a live `Function` via
  the prototype chain instead of `undefined`; (2) the buggy-validator guard
  checked `=== undefined` but not `null`, so a validator lying about its
  return type could commit `privateStates: null` and bump the revision before
  crashing later; (3) nothing verified a validator's returned `privateStates`
  map still had every player the input session had — a validator bug could
  silently erase a player; (4) `isJsonSerializable` (the utility meant to
  catch exactly "don't send a class instance/function over PeerJS") stack-
  overflowed on a circular reference instead of returning `false`, and
  accepted `class Foo extends Array {}` as a plain array since `Array.isArray`
  was checked before the prototype check.
- I reproduced all four independently before locking the fix spec. Fixed:
  own-property-only lookups (`Object.hasOwn`) in both the guard and
  `deriveSnapshot`, a "no player dropped" completeness check in `applyAction`,
  and cycle detection + array-subclass rejection in `isJsonSerializable`.
- **Incident:** the fix dispatch died mid-task with `ECONNRESET` — DeepSeek's
  connection dropped right after it had correctly applied all 4 `sync.ts`
  fixes but before adding any of the 8 required regression tests or running
  verification. Caught immediately by re-running the ladder myself rather than
  waiting for a report that was never going to arrive complete: `tsc` failed
  with a real type error the fix had introduced (TS couldn't narrow
  `outcome.publicState`/`privateStates` through the intermediate
  `hasValidState` boolean). Fixed that by hand (non-null assertions, since
  the guard already proves non-null at that point), independently re-verified
  all 4 bug fixes with fresh repro commands, then re-dispatched a narrower
  "tests only, implementation is correct and read-only" follow-up rather than
  re-running the whole original spec — which completed cleanly.
- **Lesson carried forward:** a background dispatch can die for reasons that
  have nothing to do with the model's judgment (network resets, not just
  tool-round caps) — the response here was the same either way: never treat
  "the task notification fired" as "the work is done and correct," always
  inspect the actual tree state first, and prefer a narrow, context-aware
  re-dispatch over restarting a whole spec from scratch when partial progress
  is genuinely good and just incomplete.
- **Continue?** Yes — M0-M3 all solid and committed (148 tests). M4 (bot
  seam) and M5 (Rummy harness) specs are locked in scratch. Dispatching M4
  next.

## Cycle 5 — 2026-08-07
- **Shipped:** M4 — `src/card-engine/bot.ts` (house-player seam, 19 lines) +
  tests (commit `7281cbe`).
- **Verification:** full ladder myself; read the implementation (small enough
  to review in full in seconds) — exact match to spec.
- **Review:** scoped proportionally to the module's size (Opus's own framing
  — "doesn't need M3-scale effort"). Found the implementation correct but a
  real test-coverage gap: every validator in the original test file ignored
  its `playerId` argument, so nothing actually proved `runBotTurn` submits
  under the BOT'S OWN seat rather than some other player's — a plausible
  copy-paste bug (passing the wrong variable to `applyAction`) would have
  shipped invisibly. Independently reproduced (152/152 green with a
  hardcoded wrong player id spliced into the call). Small enough fix that I
  wrote the one regression test myself rather than round-tripping another
  DeepSeek dispatch for a single `it()` block — confirmed it catches the
  mutation, reverted, re-verified the full ladder.
- **Continue?** Yes — M0-M4 all solid and committed (153 tests). M5 (Rummy
  integration harness) is the last substantial piece; spec locked in
  scratch. This is the milestone that actually proves the whole stack
  composes into something game-shaped. Dispatching next.

## Cycle 6 — 2026-08-07
- **Shipped:** M5 — `src/card-games/rummy/` (state.ts, rules.ts, rummy.test.ts):
  a minimal but real 2-player Rummy harness proving the whole card-engine
  stack composes end to end (commit `5be1100`).
- **Design decision made mid-cycle:** the generic `HostSession<TPublic,
  TPrivate>` only has "visible to all" and "visible to exactly one player"
  slots — no slot for "visible to nobody," which Rummy's stock pile needs.
  Solved by keeping the stock entirely outside `HostSession` in a small
  `RummySession` wrapper, with a validator-closure pattern
  (`applyRummyAction`/`runRummyBotTurn`) bridging it back into the generic
  `applyAction`/`runBotTurn` pipeline. This is documented as a real
  architectural decision Rummy (and future hidden-stock games) needs to
  know about, not just an implementation detail — see M6.
- **Verification:** full ladder myself; read `rules.ts` (the closure pattern)
  and `state.ts` in full against spec — exact match.
- **Review:** Opus fuzzed the two headline claims hard — 2000 randomized
  actions across 5 seeds (conservation + rejection-purity held throughout,
  including organically hitting stock/discard exhaustion the canned test
  never reached), 74 consecutive bot turns (stock threading correct across
  37 full bot-vs-bot turns), and explicit closure-staleness probes (no
  shared-mutable-cell bug across parallel/branching calls). Found no bug in
  either claim. Did find a real latent ordering hazard: the validator
  closure reported its candidate stock as soon as it decided an action was
  locally valid, before `sync.ts`'s own completeness gate got a chance to
  reject the outcome — so a hypothetical future handler bug could have a
  rejected action still silently lose a card from the stock. Not reachable
  through today's 3 real handlers (independently confirmed), but structurally
  unsafe. Also found `publicState.stockCount` — the only information any
  client gets about the hidden stock — was asserted nowhere.
- I reproduced the ordering hazard myself with a deliberately malformed
  validator before locking the fix (38→37 cards on a rejected action), and
  reproduced the fix afterward (38→38, correctly unchanged). Fixed by
  committing the candidate stock only when the outer call's `outcome.ok` is
  true, which makes the bug class structurally impossible rather than just
  papering over today's instance of it.
- Also gave Opus's review an explicit prompt for an overall assessment of
  whether the abstraction proved itself sufficient for Rummy — its answer
  (captured fully in M6): yes for the core deck/hand/turn/host-authority
  composition, with an honest caveat that the two-visibility model in
  `sync.ts` doesn't have a first-class answer for "hidden from everyone"
  state, so every future game with that need (stock piles, face-down draw
  piles) will have to re-derive the same closure pattern rather than getting
  it once from the engine. Recorded as a known limitation, not fixed now —
  changing `sync.ts`'s type signature at this point would be a bigger,
  riskier change than this charter's scope justifies, and the workaround is
  proven to work.
- **Continue?** Yes, one milestone left. M0-M5 all solid and committed (165
  tests, 5 fully independent game-engine modules plus one proof-of-concept
  game). Only M6 (documentation) remains — writing it now from what was
  actually built, not from the original specs, since several real
  architectural decisions (the stock-closure pattern chief among them) only
  crystallized during implementation and review.
