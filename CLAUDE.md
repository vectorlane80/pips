# Project constraints

Pips is a React + TypeScript + Vite site, PeerJS for serverless multiplayer, no
backend. `npx tsc -b --noEmit` and `npm run build` must stay clean at all times.

- No new runtime dependencies without a spec saying so. `vitest` as a dev
  dependency (test runner) is pre-approved for the card-engine work.
- All state that crosses PeerJS must be plain serializable data — no class
  instances, no functions, no DOM/framework objects. `JSON.stringify` round-trip
  must be lossless for anything sent over the wire.
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
