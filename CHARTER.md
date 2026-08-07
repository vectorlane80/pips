# Charter: Card-game foundation (Pips)

**Mode:** directed
**Started:** 2026-08-06
**Pre-approved:** yes — user explicitly said "do not stop and ask me any questions,
I'm going to bed" when handing off this task. No charter sign-off wait; this loop
runs unattended until done or genuinely blocked.

**Delegation override (explicit user instruction, takes precedence over this
skill's default routing):** implementer is the DeepSeek CLI (`deepseek-shell`
skill, `deepseek-v4-pro` for the substantial slices, `deepseek-v4-flash` for
routine ones), reviewer is a Claude sub-agent on `opus`. Lead (this session) still
never writes product code, still independently re-verifies everything, still owns
every architecture/security decision.

## Target user
Future-me (and this project's other games) implementing Rummy next, then Golf,
Crazy Eights, Hearts, Spades, and eventually Phase 10 — all as PeerJS
host-authoritative multiplayer card games in this same app, without each one
re-inventing decks, hands, dealing, hidden information, turn order, and sync.

## Core use case
A generic, framework-free card-engine layer (cards/deck/zones/turn-engine/sync)
that a specific game's rules module composes to get a working multiplayer card
game with minimal new code — proved sufficient via a small Rummy integration
harness, not a full Rummy UI.

## Non-goals
- Not implementing full Rummy gameplay/UI in this run (a minimal proof harness
  only — full Rummy is explicitly the *next* piece of work, out of scope here).
- Not a universal board-game framework. No abstractions for games that don't
  share deck/hand/turn structure (no board/grid engine, no dice engine — Pips
  already has a separate dice-game path for Farkle/Yahtzee that is out of scope).
- No cryptographic anti-cheat. Host-authoritative trust model only.
- Not touching the visual design system beyond the small interface contract
  needed to integrate (per user constraint).
- Not modifying Farkle/Yahtzee/TTT/Hangman gameplay — only touching shared
  infrastructure they depend on (peer.ts, room.ts, types.ts) if and where the
  card-engine needs to compose with it, and only in ways that are compatibility
  migrations, not rewrites.

## Milestones
- M0: walking skeleton — `card-engine/cards` + `card-engine/deck`: Card identity,
  standard 52-card deck creation (1..N decks), host-seeded shuffle, deal/draw,
  pure and serializable. Tests: creation, shuffle integrity (no dup/loss), deal.
- M1: `card-engine/zones` — Hand, DiscardPile, PlayerZone, PublicZone as generic
  zone containers; move-card-between-zones op; reveal/hide; recycle discard into
  stock. Tests: zone moves conserve total card count; hidden vs revealed views.
- M2: `card-engine/turn-engine` — current player, order, direction (reversible),
  next/skip/extra-turn, generic phase slot (opaque string/enum the game defines).
  Tests: advancement, skip, reverse, extra turn, phase transitions are opaque to
  the engine.
- M3: `card-engine/sync` — action/intent envelope, public/private state split,
  revision/sequence numbers, snapshot request/response for reconnection, generic
  "host validates action -> updates canonical state -> emits public broadcast +
  per-player private payloads" pipeline. Inspect and reuse `src/net/peer.ts` and
  `src/state/room.ts` patterns rather than duplicating the PeerJS transport or
  the existing dice-game reducer; this milestone is new generic module(s), not a
  rewrite of the existing games' networking. Tests: private-state serialization
  excludes other players' hands; stale revision rejected; snapshot round-trips.
- M4: house-player seam — a generic interface a bot implementation satisfies
  (inspect legal state -> choose action -> submit through the same validation
  path as a human). No AI behavior implemented, just the seam + a trivial
  always-legal-random-action stub used only by the M5 harness/tests.
- M5: Rummy integration harness — the smallest possible use of M0-M4 that proves
  the abstraction: enough game-specific state/actions/validators to deal a hand,
  draw, discard, and end a turn for 2 simulated players, exercised by a test, not
  a UI. Explicitly not full Rummy rules (melds/scoring/multiple rounds are noted
  as future work, not built here).
- M6: docs — `docs/card-engine.md` covering what was abstracted, the
  state/message model, how a new card game plugs in, decisions/limitations Rummy
  needs to know about, and any migration work performed on existing games.

## Definition of done
- M0-M6 shipped, each independently verified (typecheck, build, test suite).
- `npx tsc -b --noEmit` and `npm run build` clean at every landed slice.
- Existing games (Farkle, Yahtzee, Tic Tac Toe, Hangman) still fully functional
  — verified by re-running the existing manual smoke path at least once after
  any change touching shared files (`src/net/peer.ts`, `src/state/room.ts`,
  `src/types.ts`), and by keeping the existing per-game reducer/screens untouched
  wherever the card-engine can live alongside them instead of inside them.
  the card-engine can live alongside them instead of inside them.
- `docs/card-engine.md` exists and matches what was actually built.
- Test suite green, covering the full list in the user's spec (deck creation,
  shuffle integrity, dealing, zone moves, hidden/private serialization, turn
  advancement, invalid action rejection, stale revision rejection, reconnect
  snapshot generation, no card duplication/loss).

## Run budget
Directed mode default: 25 cycles or the milestone list (7 milestones, M0-M6),
whichever comes first. This is a bounded, well-specified feature, not an
open-ended app — expect to finish well under budget. On exhaustion: land
in-flight work, clean tree, cancel any scheduled loop, request renewal.

## Stop criteria
- Stop when all M0-M6 are shipped and DoD is met (normal completion).
- Any milestone unresolved after 3 cycles forces a pivot/pause/re-scope
  decision, not a fourth attempt.
- Pause to REQUESTS.md (and exit, per this skill's blocking protocol) only if
  something is genuinely infeasible without a human decision — e.g. a real
  architectural conflict with the existing PeerJS layer that can't be resolved
  by a reasonable judgment call. Given the user's explicit "don't ask, keep
  going," judgment calls should almost always be made and documented, not
  escalated.
- No push to GitHub without explicit user confirmation in a later session —
  local commits only, per this project's established policy. This is not a
  stop criterion in itself; the loop keeps committing locally and finishes.

## Ambiguity resolutions
- "Adapt structure to existing project" → new code lives under
  `src/card-engine/` (mirrors existing `src/games/`, `src/state/`, `src/net/`
  layout) and `src/card-games/rummy/` for the proof harness (kept distinct from
  the existing dice-game `src/games/` directory, which holds Farkle/Yahtzee/
  TTT/Hangman logic that is *not* card-engine-based and stays untouched).
- Test runner: none exists yet (no vitest/jest configured). Adding `vitest` as
  a devDependency is the minimal, Vite-native choice — not scope creep, it's a
  prerequisite the spec's "Tests" section requires.
- "Reuse existing abstractions where sound" → `src/net/peer.ts`'s PeerJS
  host/guest transport (message envelope, broadcast/send primitives) is reused
  as-is for transport; the card-engine's `sync` module defines its own message
  *payload* shapes (action/state/snapshot) that ride over that same transport,
  rather than forcing card games through the existing dice-game `Action` union
  in `src/types.ts` / `src/state/room.ts` (that union is Farkle/Yahtzee/TTT/
  Hangman-specific and not a generic action bus). A future integration slice
  (outside this charter) would decide how a card game's room is created
  alongside the existing dice-game room flow in `App.tsx`/`Room.tsx`; this
  charter's M3 stops at "the sync module works and is testable," not "card
  games are wired into the live lobby UI," since the spec explicitly excludes
  a full Rummy UI from this task.
