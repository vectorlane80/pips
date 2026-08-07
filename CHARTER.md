# Charter: Real Rummy (Pips)

**Mode:** directed
**Started:** 2026-08-07
**Supersedes:** the previous "card-engine foundation" charter (complete, see
`docs/card-engine.md` and the devlog entries through the 2026-08-07 wrap-up).
That charter's deliverable — `src/card-engine/*` — is the dependency this one
builds on, unchanged except where §Ambiguity resolutions below explicitly
calls out a generalization.

**Pre-approved:** yes — user said "go ahead and implement" plus explicitly
asked for `/autonomous-dev-loop`, `/model-routing`, and a scheduled `/loop`
for usage-limit recovery. No charter sign-off wait; runs unattended.

**Delegation (explicit user instruction, same as the prior charter):**
implementer is the DeepSeek CLI (`deepseek-shell` skill; `deepseek-v4-pro`
for substantial slices, `deepseek-v4-flash` for narrow/fix slices), reviewer
is a Claude sub-agent on `opus`. Lead (this session) never writes product
code, independently re-verifies everything, owns every architecture/security/
design decision.

**Scheduled safety net:** a wakeup is kept pending for the whole run — not
just armed once at setup — specifically so a session usage-limit reset
doesn't kill the run silently. Rescheduled at the end of every cycle while
work remains; canceled only at genuine wrap-up or a blocking pause.

## Target user
Two people (or one person + the house bot) who pick Rummy off the shelf and
want to actually play a hand — draw, meld, discard, go out, see a score —
not look at a mockup of one.

## Core use case
A complete, real two-player Rummy match, playable end to end in the running
app over the existing serverless PeerJS architecture, matching the visual
and interaction design in the handoff bundle
(`Design Handoff/design_handoff_pips 2/RUMMY.md`).

## Non-goals
- **Laying off** onto an existing meld (adding a card to a meld already on
  the table). The design doc itself says this "isn't in the design yet" —
  deferred, not an oversight. A hand can still be completed and scored
  without it; it's a strict improvement for later, not a blocker now.
- **Rummy variants** beyond the one described (no jokers, no wild cards, no
  Gin-style knocking, no Contract-Rummy sequencing across hands). Standard
  draw/meld/discard Rummy only.
- **Host migration on disconnect.** If the host (who holds the only copy of
  the stock/discard/hidden state) drops mid-hand, the hand cannot continue —
  this is a known, documented limitation of the serverless architecture
  itself, not something this charter solves. See ambiguity resolution below
  for exactly what *does* happen.
- **More than 2 players.** Rummy is a fixed 2-player game in this design
  (unlike Farkle/Yahtzee's up-to-8 scaling) — matches the shelf tile's own
  "2 players" label already shown in the design handoff.
- **Difficulty tiers for the bot.** One competent house player, not
  easy/medium/hard — Rummy's bot-strategy space (which melds to chase, what
  to discard) doesn't have the same natural difficulty knobs Farkle's bank
  threshold or Yahtzee's hold logic did; a single reasonable strategy is in
  scope, tiering is not.
- **Touching the visual design system** beyond what Rummy's card visuals
  require (a new card-face component). `tokens.css`/`components.css` stay
  as they are; anything Rummy-specific lives in its own screen/component.

## Milestones
- M0: real Rummy rules on `src/card-games/rummy/` — extend the existing
  minimal harness (`state.ts`, `rules.ts` from the prior charter) with meld
  validation (sets, runs), the discard reach-in mechanic with its
  must-use-that-card obligation, going-out detection, deadwood scoring,
  stock recycling via the already-built `recyclePile`, and multi-round match
  scoring against a target. Tests for all of it.
- M1: a real house-player bot strategy for Rummy on the existing
  `card-engine/bot.ts` seam — greedy meld-seeking, sensible discard choice,
  reasonable stock-vs-discard decision. One strategy, tested via the same
  `runRummyBotTurn` harness pattern the prior charter proved.
- M2: generalize `src/net/peer.ts`'s `createHost`/`joinHost` to be
  payload-generic (type parameters instead of hardcoded dice-game
  `Action`/`RoomState` imports) so Rummy can reuse the same PeerJS transport
  without duplicating connection plumbing — with the existing four games'
  behavior explicitly regression-verified unchanged (typecheck, build, and a
  manual browser smoke test of at least one existing game).
- M3: the Rummy card-visual component (`PlayingCard` or similar) matching
  the design handoff's exact measurements — rank/suit, suit coloring, sizes/
  radii/borders/shadows for hand cards, meld cards, discard-pile cards, and
  the card-back fan.
- M4: the `RummyTable` screen (three-band layout: their side / centre /
  your side), the discard reach-in hover/select interaction with its
  status-line copy pattern, sort toggle, lay-down/discard actions, header
  connection-status dot — plus wiring: `'rummy'` added to the game shelf,
  a Rummy room/host/join flow in `App.tsx` using M2's generalized transport,
  and hookup to the existing `Results` screen pattern for match end. Browser
  smoke test of a real turn including the reach-in interaction, host-vs-bot.
- M5: documentation — a new `docs/rummy.md` (or an addition to
  `docs/card-engine.md`, decided once it's clear which reads better) laying
  out the rules implemented, the bot's strategy, the transport
  generalization, and every deferred/limited item (laying off, host
  migration, single difficulty) so a future session knows the real state
  without re-deriving it from code.

## Definition of done
- Two players — including host-vs-house-bot — can play a complete hand of
  real Rummy end to end in the actual running app: draw (stock or reach-in
  discard), lay down valid melds, discard, go out, see a scored result, and
  (if under the match target) rematch into a new hand.
- `npx tsc -b --noEmit` and `npm run build` clean at every landed slice.
- Existing games (Farkle, Yahtzee, Tic Tac Toe, Hangman) verified unaffected
  after M2's transport generalization specifically, and again at the end.
- The design handoff's layout and interaction spec is matched (three-band
  table, spatial meld ownership, reach-in mechanic and its copy, hidden-hand
  model, header connection dot).
- Documentation lands describing what exists and what's deliberately
  deferred.

## Run budget
Directed mode default: 25 cycles or the milestone list (6 milestones: M0-M5),
whichever comes first. Expect fewer, based on the prior charter's pace
(6 milestones landed in 6 cycles, each with a review-driven fix round).

## Stop criteria
- Stop when M0-M5 are shipped and DoD is met (normal completion).
- Any milestone unresolved after 3 cycles forces a pivot/pause/re-scope
  decision, not a fourth attempt.
- Pause to REQUESTS.md (and exit, per this skill's blocking protocol) only
  if something is genuinely infeasible without a human decision. Given the
  user's explicit "go ahead, don't stop me," judgment calls get made and
  documented here, not escalated.
- No push to GitHub without explicit user confirmation in a later session —
  local commits only, same standing project policy as before.

## Ambiguity resolutions

The design handoff (`RUMMY.md`) explicitly flags 4 open questions as
undesigned. Resolved here, since the user said not to stop and ask:

1. **Host disconnect mid-hand** — RUMMY.md: "If the host drops mid-hand the
   hand cannot continue — that state needs a design before launch."
   Resolution: rely on the existing generic PeerJS disconnect handling
   already in the app (a guest's `onDisconnected` callback in
   `src/net/peer.ts`, already wired for the other four games) rather than
   building new host-migration/resume logic. A guest whose host drops sees
   whatever the existing generic disconnect UX already shows (inspect it
   fresh in M2/M4 rather than assume) and can return to the landing screen
   and start a fresh room. The in-progress hand is lost — documented as a
   known limitation, matching the design doc's own framing that this
   "needs a design before launch" (i.e., before a real public launch, which
   this app is not aiming for — it's a private family-game site).
2. **Scoring across hands / target score** — RUMMY.md: "the prototype ends
   at 'went out'; multi-hand scoring and a target score aren't designed."
   Resolution: deadwood-based scoring (`sum(min(rank,10))` over the LOSING
   player's unmelded cards, matching the design doc's own formula exactly).
   The round WINNER is awarded that amount, added to the winner's own
   running match score; **first player whose match score reaches 100 wins
   the match** and moves to the existing `Results` screen. 100 is picked as
   a reasonable
   target for a quick multi-hand session (a single hand's deadwood swing is
   typically 20-60 points, so 100 means roughly 2-4 hands per match) —
   explicit judgment call, not derived from a specific rule set.
3. **Meld-validation UI feedback** — RUMMY.md: "'Lay down' currently
   enables on any 3+ selection. When your card layer can validate sets/runs,
   the button should reject invalid groups and say why." Resolution: now
   that the card layer exists, `Lay down` is enabled only when the current
   selection forms exactly one valid meld (a set: 3-4 cards same rank,
   different suits; or a run: 3+ consecutive cards, same suit, Ace low
   only, no wrap), and disabled with a reason hint otherwise (mirroring the
   existing games' disabled-button-with-hint-text pattern, e.g. Farkle's
   "One of those doesn't score.").
4. **Laying off onto existing melds** — RUMMY.md: "isn't in the design
   yet." Resolution: out of scope for this charter (see Non-goals) — a
   player can only lay down brand-new melds from their hand, never add to
   one already on the table (their own or the opponent's). Noted for a
   future charter.

Additional resolutions the design doc didn't flag but this charter needs:

5. **Structure of the "must use that card" obligation** — reaching into the
   discard pile at index `i` takes cards `i..top` into the hand, and the
   reached-for card (at index `i`) must be used in a meld laid down before
   the turn's discard. Resolution: enforced at `DISCARD_CARD` validation
   time — if the player's current turn included a multi-card discard-pile
   take (more than the single top card), the validator tracks the
   obligated card id and rejects `DISCARD_CARD` (with a clear reason) until
   a `LAY_DOWN_MELD` action that turn included that specific card id. This
   state (the obligated card, if any) lives in `RummyPublicState` per the
   acting player's turn, cleared on discard/turn-advance.
6. **`createHost`/`joinHost` generalization approach (M2)** — make them
   generic over `<TState, TAction>` type parameters instead of importing
   concrete `Action`/`RoomState` from `src/types.ts`, keeping the exact
   same runtime message shapes/behavior (`{kind:'join'}` /
   `{kind:'action'}` / `{kind:'state'}`) — a pure type-level change, zero
   behavior change, so the 4 existing games need no logic changes, only
   (if TypeScript inference doesn't carry it automatically) explicit type
   arguments at their existing call sites in `App.tsx`. Rummy's own
   host/guest session reuses the same functions with its own `<TState,
   TAction>` — its own room codes never collide with a dice-game room's
   codes (both are randomly generated per session), so reusing the same
   PeerJS ID-namespacing scheme (`peerIdForCode`) is safe as-is.
7. **Where does Rummy's "room" live relative to the existing dice-game
   `RoomState`?** Resolution: kept separate, not merged into
   `src/state/room.ts`'s dice-game reducer/`Action` union — matching the
   prior charter's own M3 resolution that card games get their own
   sync/action model rather than being forced into the existing one. A
   Rummy session in `App.tsx` is its own parallel branch (own local React
   state, own host/guest connection via M2's generalized transport, own
   screen components), coexisting with — not replacing — the existing dice-
   game flow. `Landing.tsx`'s shelf and game-picking UX stay shared/uniform
   across all 5 games; only the underlying session machinery branches.
