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
