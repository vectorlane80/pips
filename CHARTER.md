# Charter: Phase 10 / Rummy polish pass

**Mode:** directed
**Started:** 2026-08-08
**Pre-approved:** yes — user explicitly asked for `/autonomous-dev-loop` with
`/model-routing`, in an isolated worktree, to fix a specific list of live-app
UX defects they found while actually playing the shipped game.

**Delegation:** per `/model-routing`. Live-probed at charter start: Codex
still reports usage-limit exhaustion ("try again at 6:51 PM" — same as the
prior Phase 10 charter, quota hasn't reset). Per the fallback rule, this run
uses `deepseek-v4-flash` for implementation, `claude --model sonnet --effort
medium` for adversarial review, no escalation.

**Worktree:** `.claude/worktrees/phase10-polish`, branch
`worktree-phase10-polish`. No push to GitHub, no merge to `main` without
explicit user confirmation — same standing policy, though given the pattern
of this session (user reports a live bug, expects it fixed and deployed
promptly), landing and shipping each fix as it's verified is the likely
expectation; ambiguity resolution below covers this explicitly.

## Target user
The user, actually playing the live Phase 10 / Rummy games and reporting
real friction as they hit it — not a hypothetical player.

## Core use case
Fix five specific, user-reported UX defects in the already-shipped Phase 10
and Rummy screens, verified live in a real browser (not just tsc/test/build)
before considering any of them done — per the hard lesson from the previous
hotfix cycle, where a shallow smoke test let real bugs ship.

## The five defects (user's own words, condensed)

1. **No visible point scoring in Phase 10**, and no running score readable
   anywhere on the live table (only ever shown on the final Results screen).
2. **No sufficient pause between hands.** A sound plays, then a new hand
   just appears — no round-result summary, nothing to read, nothing to mark
   that a round just ended before the next one starts.
3. **The card you just drew, in both Phase 10 and Rummy, pops immediately
   into its sorted position in your hand** instead of staying visually
   separated (e.g. at the right end) until you discard — the status-line
   "You drew the X" indicator is fine, but the card itself jumping into the
   sorted fan reads as visually confusing.
4. **The two ladder progress dots have too little contrast** — small,
   thick-bordered, both circles read as similar dark blobs (the user
   describes "you" as reading as blue, though it's actually violet — a
   real sign the current treatment doesn't read as distinct colors at that
   size). Needs bigger dots, a lighter/thinner border, or both.
5. **(raised mid-session, extending #4)** The ladder chips carry no visible
   phase number at all — only on hover — so a user can't tell which chip
   is "phase 3" without counting or hovering, and the opponent's current
   phase is marked only by that same low-contrast dot, nothing on the chip
   itself. The user was confused about why only one chip renders filled.

## Non-goals
- Redesigning the ladder's fundamental visual language (still 10 chips,
  still violet = your current phase) — this is a legibility fix, not a
  new design.
- Touching Farkle/Yahtzee/TTT/Hangman — none of these defects apply there.
- Any new game rule or scoring change — this is presentational only; the
  underlying `Phase10PublicState`/`RummyPublicState` scoring and turn logic
  are already correct (verified in the prior charter and hotfix).

## Milestones
- M1: **Round-transition visibility** — a live, always-visible running
  score for both players on `Phase10Table`, a round-over banner (mirroring
  `RummyTable`'s existing `.rummy-round-banner` pattern, Phase10-specific
  copy) that actually states the round result and both players' scores,
  and a longer `ROUND_PAUSE_MS` so there's time to read it before the next
  round deals. Touches `Phase10Table.tsx`/`.css`, `App.tsx`.
- M2: **Drawn-card hand separation** — the just-drawn card (already tracked
  as `justDrawn` in both `RummyTable.tsx` and `Phase10Table.tsx` for the
  status line) renders at the right end of the hand fan, visually separated
  from the sorted rest, until it's discarded. Touches both table files.
- M3: **Ladder legibility** — bigger, lower-contrast-border dots; a
  permanently visible phase number on every chip (not hover-only, the hover
  caption's full requirement text stays as a bonus); the opponent's
  current-phase chip gets a visible ring in their color, not just a dot,
  so their position doesn't rely on a single tiny mark. Touches
  `Phase10Table.tsx`/`.css` only.

## Definition of done
- All three milestones live-verified in a real browser: read the score
  live during play (not just at Results), watch a full round transition
  with the banner visible for a real pause, watch a drawn card stay
  separated until discarded in both games, and visually confirm the ladder
  reads clearly (numbers visible, opponent position visible without
  squinting).
- `npx tsc -b --noEmit`, `npm test`, `npm run build` clean throughout.
- No regression to Farkle/Yahtzee/TTT/Hangman (untouched by this charter,
  but re-confirm at least one still loads).

## Run budget
3 milestones, expect 1-3 cycles (M1+M2 may combine into one cycle if the
implementer handles both cleanly; M3 is CSS-only and low-risk).

## Stop criteria
- Stop when all three milestones are live-verified and shipped.
- Any milestone unresolved after 3 cycles forces a pivot/pause decision.

## Ambiguity resolutions

1. **Ship each fix as it lands, or batch and ask?** Given the pattern this
   session (user reports a live bug → expects a prompt fix → confirms the
   fix by continuing to play) and that all three milestones are small,
   low-risk, presentational changes to a game that's already live and
   currently visibly broken in these ways, land and merge/push each
   milestone once independently verified, same as the immediately prior
   hotfix cycle — rather than batching all three into one final ask. State
   clearly in the wrap-up what shipped.
2. **Round-banner score wording** — mirror Rummy's own established
   convention exactly (state each player's current CUMULATIVE score, not
   the round's point delta) for consistency between the two games' banners,
   even though a delta might arguably be more informative — matching an
   existing, already-shipped pattern beats inventing a second convention
   for a presentational-only fix.
3. **Multi-card draws (Rummy's discard reach-in can pull more than one
   card at once)** — the drawn-card separation fix (M2) only needs to
   handle the single-card-draw case, matching `justDrawn`'s own existing
   detection logic (`diff === 1`), which already doesn't fire for a
   multi-card reach-in. Not extending this — a multi-card take is a
   different, already-obligation-highlighted interaction Rummy already
   handles distinctly.
4. **Persistent chip numbers vs. the original design's hover-only spec**
   — the design handoff (`PHASE10.md`) explicitly speces hover-only
   captions with no permanent number, reasoning that dots alone should
   read "at a glance." Live user feedback says this isn't landing — the
   user was confused about which chip was which and why only one was
   filled. Resolution: add permanent small numbers per chip. This is a
   deliberate deviation from the original design doc, justified by actual
   usage over a static spec that predates any real play — noted here so
   it's a documented decision, not a silent drift.
