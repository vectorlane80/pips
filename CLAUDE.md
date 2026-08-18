# Project constraints

Pips is a React + TypeScript + Vite site, PeerJS for serverless multiplayer, no
backend. `npx tsc -b --noEmit` and `npm run build` must stay clean at all times.

## Top priority: bots play at human speed

Bots are human analogues, not automated testers. A human gives their time to a
game to think about strategy, watch the table, read what just happened — a bot
that acts faster than a human can follow breaks the actual point of the game.
This outranks "does it work" — a bot loop that is functionally correct but too
fast is still wrong.

- Never reuse a shared/default pacing constant for a new game without actually
  checking it reads as human-paced. A board-game move and a card play don't
  need the same rhythm, and a game with an existing pacing constant is not
  automatically safe for a new game to inherit — check, don't assume.
- More bots at a table means MORE consecutive fast actions land between a
  human's own turns, not fewer. Judge pacing against a full/maxed-out table,
  never a single bot in isolation — "feels fine with one bot" is not evidence
  it's fine at capacity.
- Any state-changing animation a human can see (deal/shuffle intros, dice
  flicker, card flights, reveal gates, etc.) is a real event they're watching,
  not cosmetic filler. Bot/host logic must never race ahead of a client-side
  animation — nobody should see game state change (or hear its sound) before
  the animation representing it has actually played out on their screen. If an
  animation's duration isn't known to the host, expose a pure duration
  estimator the host can hold bot activity against (see `estimateDealIntroMs`
  in `src/components/DealIntro.tsx` for the established pattern) rather than
  guessing a fixed buffer.
- A sound cue that gets cut short or overlapped by the next action's sound is
  a bug, not minor polish — pace the next bot action to let the current one's
  sound and animation actually finish.
- When a spec or fix touches bot pacing, timing, or animation sequencing, this
  section is a mandatory check before reporting done — not just tsc/test/build.

## Top priority: new games must pattern-match existing games

This app has 14+ existing games with established, working conventions —
deal/shuffle intro animations (`src/components/DealIntro.tsx`), the sound
registry's usage patterns, turn-highlight treatment, select-then-confirm
card play, hand sorting, table layout, footnote/copy tone, and more. When
building a new game (or writing a spec for one), these are not optional
extras to remember if the spec happens to mention them — they are the
default, and skipping one is a bug. This is exactly how Uno shipped without
a deal-intro shuffle, without select-then-confirm play, with an unsorted
hand, and with inconsistent turn highlighting: each was designed in
isolation as if no sibling game already answered the question.

- Before writing any spec or code for a new game, identify the closest
  existing sibling(s) by shape (card vs. board, 2-player vs. N-player) and
  read their table/room/results screens IN FULL — not a skim for one
  specific pattern the current task happens to care about.
- Every interaction, animation, and sound a sibling game already has is the
  default for the new game too, unless there is a specific, stated reason
  the new game should differ. A spec's silence on some point (e.g. "does
  this game get a deal intro?") is not permission to skip the sibling
  convention — it's a sign the spec itself needs to check what siblings do
  before it's considered complete.
- A cross-game layout/consistency pass is planned (owner-driven, e.g.
  standardizing score placement) to reduce the inconsistencies that
  currently exist between games. Once that lands, its result becomes the
  new reference baseline every future game must match — not today's ad hoc
  per-game layouts, which are known to be inconsistent in the interim.
- When a spec or fix touches a new game's screens, sounds, or interaction
  model, cite the specific sibling file(s) read and the specific
  conventions matched (or the specific, stated reason for deviating) before
  reporting done — "it works" is not sufficient, "it matches the
  established pattern, here's where" is the bar.

## Other constraints

- No new runtime dependencies without a spec saying so. `vitest` as a dev
  dependency (test runner) is pre-approved for the card-engine work.
- All state that crosses PeerJS must be plain serializable data — no class
  instances, no functions, no DOM/framework objects. `JSON.stringify` round-trip
  must be lossless for anything sent over the wire.
- The engine core (`src/engine/`: rng, turn-engine, sync, bot) is the bottom
  layer: it must not import from React, `src/screens/`, `src/components/`,
  `src/card-engine/`, `src/card-games/`, `src/games/`, or `src/state/` — pure
  functions over plain data, game-agnostic, card-agnostic.
- The card engine (`src/card-engine/`) must not import from React, from
  `src/screens/`, `src/components/`, or from any specific game's rules module.
  It also must not know about Farkle/Yahtzee/Tic Tac Toe/Hangman — those live in
  `src/games/` and `src/state/room.ts` and are a separate, older system that the
  card engine does not replace or depend on.
- Card-game-specific rules (what a valid run/set/meld is, wild cards, knocking,
  scoring) belong under `src/card-games/<game>/`, never inside `src/card-engine/`.
- Host is authoritative: randomization (shuffling), action validation, and
  canonical state all happen host-side. Client code only submits action
  intents and renders state it's given.
- Match the existing code style in `src/games/*.ts` and `src/state/room.ts`:
  plain functions over classes, explicit types, no defensive code for
  conditions that can't occur, no abstractions beyond what the current spec
  needs, no drive-by refactors of unrelated files.
- Never touch files outside the ones a given task explicitly names as yours
  to write.
- Tests live beside the code they test (`*.test.ts`) and use `vitest`. Run with
  `npm test`.

## Git workflow

- Every work request gets its own branch off `main`, created before making
  changes. Never commit directly on `main` — parallel agent threads working
  on `main` at once is exactly what causes collisions.
- Committing to the local branch is always fine, any time, without asking —
  commit early and often as work lands.
- Merging into `main` and pushing to GitHub requires explicit permission.
  The word "push" from the user *is* that permission — don't ask again once
  given, just merge the branch into `main` and push. Never merge/push on
  your own initiative, even if tests are green and the branch looks done:
  a GitHub Pages build kicks off on push, and that must not happen while
  the user is mid-test against the live/deployed code.
- The moment a push succeeds, prune the branch immediately — delete it both
  locally and on the remote. Don't leave merged branches lying around.
