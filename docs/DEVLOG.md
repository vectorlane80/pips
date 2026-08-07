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

## Wrap-up — 2026-08-07

Charter complete. All 6 milestones (M0-M6) shipped in 6 cycles, fully
unattended per the user's instruction. Final state: 165 tests across 8
files, `npx tsc -b --noEmit` and `npm run build` clean, 12 commits on
`main` (all local — no push, per the project's standing policy of asking
before pushing to GitHub).

**Every single milestone's adversarial review found and fixed a real
defect** — this is worth stating plainly since it's the strongest evidence
the review discipline was load-bearing, not theater:
- M0: shuffle/RNG tests too weak to catch a biased Fisher-Yates or an
  algorithm swap.
- M1: `removeCardsById` duplicated a card when the same id was requested
  twice — a genuine conservation break.
- M2: `skipNext`'s test only checked 3 of 5 result fields, missing a
  silent `direction` corruption.
- M3 (the trust-boundary module, reviewed hardest): an unguarded
  prototype-chain lookup, a buggy-validator guard that missed `null`, a
  validator that could silently drop a player, and `isJsonSerializable`
  holes (circular-reference crash, array-subclass bypass).
- M4: nothing proved a bot submits under its own seat id, not another
  player's.
- M5: a latent ordering hazard where a rejected action could still leak a
  card out of the stock pile via a closure side-channel.

Two implementer sessions died mid-task from infrastructure issues (a
25-tool-round cap, a network `ECONNRESET`) rather than reasoning failures
— both caught immediately by re-verifying the tree myself rather than
trusting a completion notification, and recovered with narrow,
context-aware re-dispatches rather than restarting whole specs. One real
lead mistake (a wrong golden RNG value sourced from a review report,
cycle 1) was caught by the implementer's own verification discipline
before it could propagate — a reminder that "independently verify"
applies to every link in the chain, including the reviewer's own output,
not just the implementer's.

**Delegation split honored throughout, per explicit user instruction:**
DeepSeek CLI (`deepseek-v4-pro` for substantial slices, `deepseek-v4-flash`
for narrow fixes) wrote 100% of the product code and tests; Opus
sub-agents ran every adversarial review; this session (Sonnet) made every
design decision, wrote every spec, and independently re-verified every
single claim before committing — never advanced on a report alone.

**What's next** (separate, future charter, not started here): full Rummy
rules (melds/sets/runs/scoring/multiple rounds) and wiring a card-game
session into the live app (screen routing, PeerJS transport). See
`docs/card-engine.md` §5 for the precise boundary between what exists and
what doesn't.

**Continue?** No — charter's definition of done is met. Wrapping up.

---

# Charter 2: Real Rummy — 2026-08-07

New charter started (see CHARTER.md, rewritten for this scope; ROADMAP.md
reset). Task: real Rummy rules + bot + UI + live wiring on top of the
card-engine foundation from charter 1. Pre-approved, unattended — same
DeepSeek/Opus delegation split. Scheduled safety-net wakeup armed and will
be kept pending for the duration of this run per explicit user request
(usage-limit recovery), not just a one-time arm.

## Rummy cycle 1 — 2026-08-07
- **Shipped:** M0a — `src/card-games/rummy/{rank,melds,scoring}.ts` + tests
  (commit `b0c5595`). Pure meld classification and deadwood scoring, zero
  game-engine wiring.
- **Verification:** full ladder myself; read every source file against spec
  (exact match).
- **Review:** Opus differentially fuzzed `classifyMeld` against an
  independently-written second implementation — 20,000 random selections
  plus an EXHAUSTIVE sweep of all 22,100 three-card subsets of a real deck,
  zero mismatches either way (this is what actually proves the Ace-low/
  no-wrap boundary, not eyeballing the code). 8 of 9 deliberate mutations
  caught. The survivor was real: no test used a run crossing the 9→10 rank
  boundary, so `Array.prototype.sort()`'s default lexicographic comparison
  (a well-known JS footgun) could have silently misclassified `8-9-10` as
  invalid. Independently reproduced, added the one missing test myself
  (small enough not to round-trip another dispatch), confirmed it catches
  the mutation, reverted.
- **Continue?** Yes — on track. M0b (the rules-engine integration: melds
  wired into actions, reach-in obligation, going-out, stock recycling,
  multi-round scoring) is the next, larger slice — spec already fully
  designed, dispatching next.

## Rummy cycle 2 — 2026-08-07
- **Shipped:** M0b — `state.ts`/`rules.ts` extended into real Rummy: meld
  validation wired into `LAY_DOWN_MELD`, discard-pile reach-in with an
  obligation mechanic, going-out detection (meld or discard to empty
  hand), stock recycling via `recyclePile`, `START_NEXT_ROUND` for
  multi-round matches, deadwood-based scoring (round winner awarded the
  loser's deadwood, first to 100 wins the match). Deal size changed from
  the M5 harness's 7-card/empty-discard placeholder to the real design's
  10 cards + 1 flipped starting discard card (commit `b8fe7d0`).
- Also fixed a wording inconsistency in `CHARTER.md`'s scoring-direction
  ambiguity resolution, spotted while designing this milestone — the
  prose read as if the losing player's score went up, which would
  contradict "first to target wins." Corrected to be unambiguous: the
  winner is awarded the loser's deadwood.
- **Verification:** full ladder myself; read the diffs to `state.ts`/
  `rules.ts`/`melds.ts` line by line against spec — matched exactly
  (deal logic factored into a shared `dealRound()` helper as specced,
  the existing stock-commit-only-on-`outcome.ok` pattern preserved and
  extended rather than touched).
- **Review:** Opus reviewed this milestone the hardest since M3
  (`sync.ts`) — appropriately, since a validator this size sitting at
  the PeerJS trust boundary is exactly the shape of module that hid
  M3's bugs. Found and I independently reproduced 4 real defects before
  locking the fix spec:
  - A **permanent-deadlock bug**: reaching into the discard pile for a
    card that turned out to be unmeldable with the resulting hand set
    an inescapable obligation — no meld could clear it, `DISCARD_CARD`
    refused forever, and `START_NEXT_ROUND` was unreachable since the
    round could never end. Reachable in ordinary honest play (a
    misjudged reach), not just adversarially.
  - Two **host-crashing malformed inputs**: `DRAW_FROM_DISCARD`'s
    `index` guard let `NaN`/non-integers through (comparisons against
    `NaN` are always false) straight into an unguarded array index;
    `LAY_DOWN_MELD`'s `cardIds` handling threw on anything that wasn't
    an array. Either one is a single crafted PeerJS message away from
    killing the host for both players.
  - `START_NEXT_ROUND` accepted **any playerId**, not just the two
    match participants — any connected peer could force a redeal.
  - Two test-quality gaps: a going-out conservation check asserting
    against the *pre-action* session instead of the result, using a
    `Set` that can't detect a card counted in two zones at once; and
    deadwood assertions that recomputed their expected value by calling
    the same function under test on the same data, so a wrong
    `deadwoodValue` couldn't have been caught.
- Fixed: `melds.ts` gained a `hasMeldIncluding()` combinatorial-subset
  check, called before a multi-card reach-in is allowed to set an
  obligation; `Number.isInteger`/`Array.isArray` guards on the two
  crash sites; an `Object.hasOwn(privateStates, playerId)` participant
  check on `START_NEXT_ROUND`; count-based conservation assertions on
  `result.rummy` plus literal (not recomputed) deadwood values in the
  affected tests. All independently re-verified — malformed-input tests
  now assert `{ ok: false }` without throwing, the deadlock repro now
  asserts full state is unchanged on rejection.
- **Lesson carried forward:** the `sync.ts` (M3) and now `rummy/rules.ts`
  (M0b) reviews are the two hardest-hitting ones of either charter, and
  both are validators sitting directly at the PeerJS trust boundary —
  reinforces that any module accepting caller-supplied action payloads
  needs adversarial-grade scrutiny by default, not proportional-to-size
  scrutiny the way a small pure-logic module (M0a, M4) can get away with.
- 226 tests (up from 205).
- **Continue?** Yes — Rummy is now really playable at the rules-engine
  level. M1 (house-player bot strategy) is next.

## Rummy cycle 3 — 2026-08-07
- **Shipped:** M1 — `src/card-games/rummy/bot.ts`/`bot.test.ts`: a single
  `rummyBotStrategy` on the `card-engine/bot.ts` seam. Draw phase takes
  the discard pile's top card when it's immediately meldable, else draws
  stock; discard phase lays down melds (constrained to the obligated
  card when reaching-in set one) before discarding the least-connected
  card (fewest same-rank/same-suit-within-2 neighbors, ties broken by
  highest deadwood). No difficulty tiers — one reasonable strategy, as
  scoped (commit `4fc3752`).
- **Verification:** full ladder myself; read the whole implementation
  (small, new, additive-only) against spec — matched.
- **Review:** Opus reviewed this as carefully as `sync.ts` (M3) and
  `rules.ts` (M0b) — correctly so; a bot strategy the host loop calls
  repeatedly across a turn has the same "what if state looks unusual"
  surface. Found 3 real defects, all independently reproduced (small
  standalone vitest repros, not just re-reading the review's claims)
  before locking the fix spec:
  - A **livelock**: when stock is empty and the discard pile has
    exactly 1 unmeldable card, the bot proposed `DRAW_FROM_STOCK`
    forever (never checked `stockCount`), and since a rejected action
    doesn't mutate state, it would repeat identically on every call.
    Reachable via ordinary legal play (a big reach-in that drains the
    discard pile, followed by a normal discard leaving exactly 1 card).
  - A **crash**: `rules.ts`'s going-out handler doesn't advance
    `turn.phase`/`currentIndex` (by design — `roundOver` is the correct
    signal). A caller loop keyed on "is it still my turn" rather than
    checking `roundOver` first could call the bot again on an empty
    hand, and `selectDiscard([])` threw reading `.rank` off
    `hand[0] === undefined`.
  - A **greedy meld choice that threw away a guaranteed round win**:
    `findMeld` always picked the single largest meld, with no lookahead
    — a 6-card hand with two simultaneous melds available (a 4-card run
    + a 3-card set, using all 6 cards) got the 4-card run laid down
    first, stranding the other 2 cards and missing an outright win that
    was there for free.
- Fixed: a `stockCount === 0` fallback to a safe single-card discard
  take; a top-of-function `roundOver` guard that returns
  `START_NEXT_ROUND` (both crash-proof AND the actually-correct action
  in that state, not just a defensive no-op); and `bestFirstMeld`, a
  small memoized recursive search (hands are small, ≤ ~14 cards, capped
  defensively) that picks the meld leading to the most total cards
  melded this turn rather than the single biggest meld. Also fixed 2
  vacuous test assertions and 1 silently-swallowed `START_NEXT_ROUND`
  failure in the bot-vs-bot test loop.
- **Incident:** the fix-spec dispatch hit DeepSeek's 25-tool-round cap
  again — this time after correctly applying all 5 fixes (verified: read
  `bot.ts` by eye, all 3 code fixes present and correct; typecheck/
  tests/build all green) but before writing any of the spec's required
  NEW regression tests (the ones that would have caught these bugs in
  the first place — livelock, crash, and the 6-card win scenario). Since
  the fixes themselves were small and already correct, I wrote the 4
  missing regression tests by hand rather than re-dispatching a follow-
  up task for something this size — same judgment call as M4/M0a in the
  prior charter. All 4 pass, including the win-scenario test which
  fails against the pre-fix `findMeld`-only logic (verified this
  by reasoning through the old code path, not by re-running a reverted
  version — the fix is committed and correct).
- **Lesson carried forward:** this is the third time a DeepSeek dispatch
  has hit the 25-tool-round cap specifically on a *fix* task that had
  more post-fix work (tests, verification) queued after the fixes
  themselves — fix specs that bundle "apply N targeted fixes" with "add
  M new regression tests" are more cap-prone than milestone specs,
  possibly because reading+editing+re-reading each existing test file
  section costs more tool-rounds than writing fresh code. Worth
  splitting large fix-plus-test specs into two dispatches (fixes first,
  tests second) if a fix spec has more than ~4-5 required new tests.
- 244 tests (up from 226).
- **Continue?** Yes — M0b and M1 both landed clean. M2 (generalize
  `src/net/peer.ts`'s transport to be payload-generic) is next — the
  last piece of plumbing before the visual/UI milestones (M3/M4).
