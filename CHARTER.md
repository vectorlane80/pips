# Charter: Uno (2026-08-15)

Full-rules Uno on the card-engine pattern (`src/card-games/uno/`, mirroring
Rummy/Phase10's shape), N players (not the designer handoff's 4-seat cap —
built on the Wahoo/Mexican Train multi-seat pattern instead), plus two pieces
with no existing precedent in this codebase: a house-rules toggle structure
and the Uno-call race mechanism. Design fully settled in chat with the user
before this charter opened; nothing below is open for the implementer to
redesign.

User sign-offs (2026-08-15): designer's 4-seat cap explicitly overridden —
build genuinely N-player; UI-only timing enforcement for the Uno-call window
(no host-side wall-clock, cosmetic client stagger only) approved over a
host-enforced-timestamp alternative; "Draw until you can play" approved as
the one seed house rule to prove the toggle pathway.

## M1 — Uno module (`src/card-games/uno/`)
- 108-card deck (4 colors × [0, 1-9×2, skip×2, reverse×2, draw-two×2] + 4
  wild + 4 wild-draw-four), state/rules/bot mirroring Rummy's shape (see
  `docs/card-engine.md` §5 for the hidden-stock wrapper pattern this needs —
  the draw pile is visible to nobody, same as Rummy's stock).
- N players via `playerIds: string[]` at game creation, Record<playerId, T>
  state throughout — no 2-hardcoding anywhere (Wahoo/MT precedent, not
  Rummy/Phase10/Battleship's 2-player-only shape).
- Standard rules: match top discard by color/number/type or play a wild any
  time; Skip/Reverse/Draw-Two apply immediately to the next player; Reverse
  acts as Skip in a 2-player game; no playable card → draw one (play
  immediately if it's now legal, else turn passes); going out scores every
  other player's remaining hand into a running total (number=face value,
  action cards=20, wild/wild4=50); first to 500 wins the match; rounds
  repeat with the starter rotating.
- Explicitly OUT of M1 scope (separate milestones below): the Uno-call
  window/race mechanism, and house rules. M1 ships a complete, correctly-
  scored base game where nobody can be caught not calling Uno yet — that's
  a valid intermediate state, not a bug, until M2 lands.
- Bot: prefers action cards over plain numbers when it has a choice, prefers
  non-wild over wild when both are legal, picks the color it holds most of
  for a wild. `BotDifficulty` easy/medium/hard threaded through from the
  start (per `Design Handoff/ROOM-LOBBY.md`, it's currently only real for
  Chess/Checkers — Uno needs its own genuine wiring, not a stub).

## M2 — Uno-call race mechanism
- `unoWindow: { playerId: string } | null` on public state — at most one
  active window in the whole game ever, by construction (confirmed with the
  user: simultaneous multi-player vulnerability cannot happen — the window
  is destroyed by the very next player's first action before a second
  player could ever open one).
- Opens the instant a player's turn ends holding exactly 1 card. Destroyed
  by whichever happens first: a successful call (self or catch), or the
  next player's first action (draw or play) — no lingering flag, the
  window's existence IS the "vulnerable and undeclared" state. If
  destroyed uncalled, that player is not vulnerable again until their own
  next turn ends still at 1 card (a fresh window, not a reopened one).
- Host validates only "is there an open window, does the target match" —
  zero clock involved. The 1-second self-priority stagger (vulnerable
  player's own button clickable at T=0, everyone else's catch button for
  them clickable at T=+1000ms) is enforced client-side only, cosmetically —
  a modified client could click early; accepted tradeoff for this casual
  context, not a bug to harden later.
- Catch penalty: flat draw-2, independent of whatever card was played.
- UI: uncolored, unobtrusive toggle-style button, far right of each hand
  row (same slot Rummy/Phase10 put their sort toggle) — NOT that pill's
  loud dark-active style. Off = grayed out, on = a subtle shift to white,
  nothing else changes. The eye should not be drawn to it activating; this
  is deliberate game-design tension, not a missed affordance.
- Bot: on seeing any Uno button active for it (self-call or a catch
  opportunity), waits a random 500-1500ms then clicks, with a small chance
  of not clicking at all. Deliberately longer than the 1s self-priority
  window — bots will sometimes miss their own self-call and become
  legitimately catchable; do not "fix" this by making bots reliable.
  Tuned by difficulty: easy = longer delay + higher skip chance, hard =
  shorter delay + lower skip chance.

## M3 — House rules structure
- `UNO_HOUSE_RULES` array of `{key, label, description, default}` rendered
  generically by the room screen as toggles — adding rule #2 later is one
  array entry + one `if` in rules.ts, no new UI code. Stored as
  `UnoPublicState.houseRules: Record<string, boolean>`, chosen host-side at
  room-creation time (Battleship `variant` precedent for timing, generalized
  from a single exclusive choice to independent toggles).
- Ships with exactly one real rule: "Draw until you can play" (vs. standard
  draw-one-and-pass) — contained entirely inside the draw action's
  validator, touches nothing else.

## M4 — Screens + multi-seat wiring
- UnoRoom (multi-seat, Wahoo/MT-style: open-seat slots up to some cap TBD
  by the implementer's read of a sane UI limit, not the designer's 4 —
  house-rules toggle section, difficulty picker), UnoTable (table panel
  left flex 1 1 620px, scoreboard/log right column flex 1 1 230px max
  330px — per `Design Handoff/UNO.md`), UnoResults, UnoRulesOverlay. Visual
  spec: `Design Handoff/UNO.md` in full — card back/face, wild band, action
  icons (⊘ skip, ⇄ reverse, "+2"), fanned hand (margin-left:-30px per card,
  ascending z-index), no opacity/ring on playable cards (cursor+handler
  only), click-the-deck-to-draw (gold ring, no separate button), brand
  `#e11d2e`.
- Wiring: UN- prefix, multi-seat lobby plumbing per the Wahoo/MT pattern —
  `HostHandle.sendTo` for private hands (same reason MT needed it: 3+
  guests can't share one broadcast without leaking), bot-per-empty-seat,
  bot-turn loop. Landing chip, README count bump.

## Non-goals
Spectators, house rules beyond the one seed rule (stacking/jump-in/7-0 are
explicitly future work, not this charter), tournament/multi-match play
beyond the standard first-to-500 round-robin, real card-flip/shuffle audio
beyond what's already in the shared sound registry (card-play/card-draw/
shuffle/round-win/game-win — reuse, don't invent new assets this charter).

## Definition of done
Live N-player match (host + multiple house bots, at least 5 to prove the
cap override) through a full round: skip/reverse/draw2/wild/wild4 all
exercised, a deliberate 1-card sit-and-get-caught by a human catching a bot
and a bot catching a human, the draw-until-playable house rule toggled on
and verified to change draw behavior, a full match to 500 with correct
scoring and starter rotation. Oscar module + wiring + visual reviews;
tsc/tests/build green throughout; docs/uno.md written; README updated.

## Budget / routing
Directed: expect 6-9 cycles (M1 alone is comparable in scope to Rummy/
Phase10's original module charters), cap 25. deepseek-shell implements,
Oscar (ai-grouch-claude) on this session's model reviews. Any milestone
stuck 3 cycles forces a pivot/re-scope decision, not a fourth attempt.
This project's standing CLAUDE.md rule (never git commit/push) holds
through this whole charter same as every prior one — work accumulates
verified in the tree; commit/push is requested via REQUESTS.md + chat at
natural stopping points, not automatic per cycle.
