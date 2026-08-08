# Charter: Phase 10 (Pips)

**Mode:** directed
**Started:** 2026-08-08
**Supersedes:** the "Real Rummy" charter (complete, see `docs/rummy.md` and
the devlog's 2026-08-07 wrap-up). That charter's deliverables —
`src/card-engine/*` (unchanged except §Ambiguity resolution 1 below) and the
generalized `src/net/peer.ts` transport — are dependencies this one builds
on directly.

**Pre-approved:** yes — user explicitly said "execute the addition of
Phase 10," asked for an isolated worktree, and asked for `/model-routing`
and `/autonomous-dev-loop` by name. No charter sign-off wait.

**Delegation (per `/model-routing`, checked live this session):**
implementer is `codex exec` (`gpt-5.6-terra` @ low) for spec-locked
implementation and test authoring — **but Codex reported usage-limit
exhaustion on the live availability probe at charter start** ("hit your
usage limit... try again at 6:51 PM"), so per the routing skill's
fallback rule this run uses `deepseek -m deepseek-v4-flash` for
implementation from cycle 1 onward, no escalation, no re-asking. Re-probe
Codex each cycle; switch back only if it responds clean, per the skill's
"availability is runtime state" guidance. Reviewer is `claude --model
sonnet --effort medium` (confirmed live), never Codex for review per the
table's explicit prohibition. Lead (this session) never writes product
code, writes every spec, independently re-verifies every claim, owns
every architecture/security/design decision. This differs from the prior
charter's DeepSeek+Opus-review split — that was a prior session's
explicit one-off instruction; this session's explicit instruction is
`/model-routing`, so its table (and fallback rule) governs.

**Scheduled safety net:** kept pending for the whole run, rescheduled at
the end of every cycle while work remains, canceled only at wrap-up or a
genuine blocking pause.

**Worktree:** all work happens in the git worktree at
`.claude/worktrees/phase10` (branch `worktree-phase10`), entered via
`EnterWorktree` per the user's explicit "open an isolated worktree"
instruction. Commits land on `worktree-phase10` only. No push to GitHub
and no merge into `main` without explicit user confirmation in chat —
same standing project policy carried over from the prior charter.

## Target user
Two people (or one person + the house bot) who pick Phase 10 off the shelf
and want to play real hands — draw, lay a phase, hit, discard, skip an
opponent, work up the phase ladder to Phase 10 — not look at a mockup.

## Core use case
A complete, real two-player Phase 10 match, playable end to end in the
running app over the existing serverless PeerJS architecture, matching the
visual and interaction design in
`Design Handoff/design_handoff_pips 2/PHASE10.md`, and the official rules
at phase10rules.com (deck composition, the 10 phases in order, scoring
table, skip/wild mechanics) as confirmed at charter start.

## Non-goals
- **More than 2 players.** Like Rummy (not like Farkle/Yahtzee's 2–8), the
  design handoff's layout shows exactly one opponent band, no
  player-count picker. Matches the shelf tile's expected "2 players" note.
- **Reach-in on the discard pile.** PHASE10.md is explicit: "top card
  only — no reach-in, unlike Rummy" — a real rule difference, not an
  oversight to fix.
- **Difficulty tiers for the bot.** One competent house player, same
  precedent as Rummy.
- **Touching the visual design system** beyond Phase 10's own card-face
  component and screen. `tokens.css`/`components.css` stay as-is.
- **Host migration on disconnect.** Same documented limitation as Rummy —
  see ambiguity resolution below.

## Milestones
- M0 (prep): widen `card-engine/cards.ts`'s `Suit`/`Rank` from closed
  literal unions to `string`. Phase 10 needs values (`'red'|'blue'|
  'green'|'yellow'`, `'1'..'12'`, `'SKIP'`, `'WILD'`) the current literal
  unions can't express, and `zones.ts`'s `Zone.cards: Card[]` is hardcoded
  to that type — there's no generic-over-card-shape escape hatch. Pure
  type-level widening, zero behavior change: `SUITS`/`RANKS`/
  `createStandardDeck` keep producing the exact same values, every
  existing card-engine and Rummy test stays green unmodified. This is the
  same category of move as the prior charter's M2 (`peer.ts` generalized
  to `<TState,TAction>`) — widen a shared primitive's type, not its
  behavior, so a second consumer can exist without forking the file.
  Verified by: full test suite unchanged, `tsc -b --noEmit`, `npm run
  build`.
- M0a: pure Phase 10 rules on `src/card-games/phase10/` — deck builder (108
  cards: 24 each red/blue/green/yellow numbered 1–12, 4 Skip, 8 Wild),
  phase requirement table (the 10 phases, exact wording from the design
  handoff table), and pure classifiers: is a set of N cards (with 0+
  wilds, ≥1 natural required) a valid "set of N", a valid "run of N", or
  (Phase 8) "N cards of one color." No wiring yet. Tests for all of it,
  including wild-substitution edge cases and the ace-adjacent question
  (Phase 10 numbers run 1–12 with no wraparound — 12 is not adjacent to
  1).
- M0b: full rules engine (`state.ts` + `rules.ts`) wired onto
  `card-engine`'s `sync.ts`/`turn-engine.ts`/`bot.ts` seams, mirroring
  Rummy's stock-visible-to-nobody closure pattern from
  `docs/card-engine.md` §3. Deal 10, draw (stock, or discard top-only —
  never a Skip off the discard, per official rules), lay your current
  phase (once per hand, whole phase from hand at once), hit onto any
  laid group (yours or the opponent's) after your own phase is laid,
  discard to end turn (Skip cards resolve their effect automatically on
  discard — see ambiguity resolution 2), going out, stock recycling via
  the existing `recyclePile`, round scoring (5/10/15/25 point table),
  phase advancement (completers move to next phase index, non-completers
  repeat), match end (first to complete Phase 10 and go out wins; ties on
  the same hand broken by lowest cumulative score). Tests for all of it,
  scenario-style like `rummy.test.ts`.
- M1: house-player bot strategy on `card-engine/bot.ts`'s seam — greedy
  phase-completion seeking, sensible discard (don't feed the opponent's
  visible phase progress), opportunistic hitting once its own phase is
  laid, stock-vs-discard draw decision, Skip played when it denies the
  opponent a card they visibly need. One strategy, tested via
  `runBotTurn`.
- M2: **none needed.** `src/net/peer.ts`'s `createHost`/`joinHost` are
  already generic over `<TState, TAction>` (Rummy's M2) — Phase 10 reuses
  them with its own type arguments, no transport work required. Folded
  into M3's wiring instead of its own milestone.
- M3: the Phase 10 card-visual components — `Phase10Card`/`CardBack`
  (or similar), matching PHASE10.md's exact spec: flat-ink card back with
  yellow keyline and "10", solid-color number tiles (no suits), ink Skip
  tile, 4-stop diagonal-gradient Wild tile, sizing/radii/selected-state
  matching the fan/meld/discard measurements given.
- M4: the Phase 10 screen — ladder band (10 chips, hover-to-caption, dual
  progress dots), centre band (stock + discard top-only, turn/status
  chip), your/their bands (laid groups spatially separated by owner, "Lay
  phase N" pill), hand band (fan, lay/discard actions) — plus wiring:
  shelf tile added to `Landing.tsx`, a Phase 10 room/host/join flow in
  `App.tsx` reusing the generalized transport (own `P10-`-prefixed room
  codes, disambiguated in the shared join field same as Rummy's `RM-`),
  hookup to a Phase-10 results/match-end panel. Resolves PHASE10.md's
  open questions 2 and 3 (ambiguity resolutions below). Browser smoke
  test of a real turn including laying a phase, hitting, and a skip,
  host-vs-bot.
- M5: documentation — `docs/phase10.md` covering rules as implemented,
  the trust-boundary architecture, bot strategy, UI, and every
  deferred/limited item, matching `docs/rummy.md`'s shape.

## Definition of done
- Two players — including host-vs-house-bot — can play a complete hand of
  real Phase 10 end to end in the actual running app: draw, lay a phase,
  hit onto laid groups, discard (including playing a Skip), go out, see a
  scored round, advance up the phase ladder across multiple hands, and
  reach a match winner at Phase 10.
- `npx tsc -b --noEmit` and `npm run build` clean at every landed slice.
- Existing games (Farkle, Yahtzee, Tic Tac Toe, Hangman, Rummy) verified
  unaffected — especially after M0's `cards.ts` type widening — at the
  end of the run at minimum.
- The design handoff's layout and interaction spec is matched (ladder,
  spatial group ownership, top-card-only discard, hover captions).
- Documentation lands describing what exists and what's deliberately
  deferred.

## Run budget
Directed mode default: 25 cycles or the milestone list (7 milestones:
M0, M0a, M0b, M1, M3, M4, M5 — M2 folded away), whichever comes first.
Expect close to 7, based on both prior charters landing one milestone
(occasionally split) per cycle.

## Stop criteria
- Stop when the milestone list is shipped and DoD is met.
- Any milestone unresolved after 3 cycles forces a pivot/pause/re-scope
  decision, not a fourth attempt.
- Pause to REQUESTS.md only if something is genuinely infeasible without
  a human decision — given the explicit "execute this" instruction,
  judgment calls get made and documented here, not escalated.
- No push to GitHub, no merge to `main`, without explicit user
  confirmation in a later message.

## Ambiguity resolutions

PHASE10.md flags 4 open questions. Resolved here so the run doesn't stop
to ask:

1. **Host disconnect mid-hand** — same resolution as the Rummy charter:
   rely on the existing generic PeerJS disconnect handling already wired
   in `src/net/peer.ts`. No new host-migration logic. Documented known
   limitation.
2. **Skip card target selection** — PHASE10.md flags this as needing "a
   UI moment for 'choose who to skip.'" Resolution: **not needed.**
   Phase 10 is 2-player only (see Non-goals) — a Skip has exactly one
   possible target, the sole opponent, so it resolves automatically the
   instant a Skip is discarded. No new action type, no picker UI. Skip
   still goes onto the discard pile as the (untakeable) top card, per
   official rules ("a skip card may never be picked up from the discard
   pile"). Capped at one Skip played against the same opponent per round
   (official rule; trivially "one per round" in a 2-player game), tracked
   on `Phase10PublicState` and cleared on `START_NEXT_ROUND`.
3. **Hitting validation feedback** — PHASE10.md: "the ring shows *that*
   you can attempt a hit, not whether the specific card is valid." Now
   that the rules engine (M0a/M0b) can validate a hit, resolution: a hit
   attempt goes through the same `ActionValidator` as everything else; on
   rejection, the UI shows an inline reason (mirrors the existing
   disabled-button-with-hint pattern, e.g. Rummy's lay-down gating).
4. **Phase failure at hand end** — PHASE10.md: "no 'hand over, redeal'
   transition designed yet, only 'someone goes out.'" Resolution: a
   *round* ends the instant a player discards their last card. Players
   who laid their current phase this round advance to the next phase
   index for the next round; players who didn't repeat the same phase
   index. Deal, stock, discard, and all laid groups reset for the next
   round; `p10MyPhaseIdx`/`p10OppPhaseIdx`-equivalent persist across
   rounds. The match ends the moment a player both completes Phase 10
   *and* goes out in the same hand — ties (both complete Phase 10 in the
   same hand) broken by lowest cumulative score, per official rules,
   confirmed at charter start via a live fetch of phase10rules.com.

Additional resolutions PHASE10.md didn't flag but this charter needs:

5. **`Card.rank`/`Card.suit` representation for Phase 10's four card
   kinds.** Numbers use `suit` = color (`'red'|'blue'|'green'|'yellow'`),
   `rank` = the number as a string (`'1'`..`'12'`); Skip uses
   `suit:'special'`, `rank:'SKIP'`; Wild uses `suit:'special'`,
   `rank:'WILD'`. `meta: {kind: 'number'|'skip'|'wild'}` is set on every
   card as the primary discriminator the rules engine actually switches
   on (never string-parsing `rank`), per `cards.ts`'s own documented
   purpose for `meta` ("an untouched tag space for game-specific flags").
6. **Wild-card commitment.** Per official rules, once played a wild
   cannot be moved or reclaimed. Enforced structurally: laid phase groups
   and hit/lay-off records are append-only, same as Rummy's
   `RummyLayoff` pattern — nothing in the validator ever removes a card
   from an already-laid group.
7. **Where does Phase 10's "room" live relative to the existing dice-game
   `RoomState` and Rummy's session?** Resolution: same pattern as
   Rummy — a third fully parallel branch in `App.tsx` (own state, own
   host/guest/bot wiring reusing the already-generalized
   `createHost`/`joinHost`), not merged into `room.ts` or into Rummy's
   session code. `Landing.tsx`'s shelf stays uniform across all 6 games;
   only session machinery branches, exactly as `docs/card-engine.md` §
   Migration work anticipated.
