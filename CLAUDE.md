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
- Never run `git commit`/`git push`. Never touch files outside the ones a given
  task explicitly names as yours to write.
- Tests live beside the code they test (`*.test.ts`) and use `vitest`. Run with
  `npm test`.
