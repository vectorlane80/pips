# Charter: Item-generic containers (dominoes prep)

**Mode:** directed
**Started:** 2026-08-09
**Pre-approved:** yes — user: "Generalize the containers, the first
dominoes game is being laid out by the designer now." Same routing as the
prior charters (deepseek:flash implements, sonnet reviews, no Codex).

## Design decisions (locked)

- `Zone<T extends { id: string } = Card>` in `src/card-engine/zones.ts`;
  the item field KEEPS its name (`cards: T[]`) so every existing call
  site, wire payload, and test is untouched. All zone helpers become
  generic with the same default.
- `shuffleDeck` / `dealCards` / `drawCard` in `deck.ts` become generic
  `<T>` (they are pure array ops; no constraint needed). Return-field
  names unchanged (`dealt`/`remaining`/`card`). `createStandardDeck` and
  `cards.ts` stay card-specific.
- zones.ts STAYS in `src/card-engine/` — the `= Card` default requires
  importing Card, which bars it from `src/engine/` (bottom layer must be
  card-agnostic). Dominoes will sit on the card-engine stack and import
  from it, which the layering already permits.
- Zero behavior change; zero test edits; card-games diffs zero. The
  future dominoes module will define its own tile type
  (`{ id, low, high }`-shaped) and a `createDominoSet` in its own game
  directory — explicitly NOT part of this charter.

## Milestone / definition of done
- M1: the generic signatures land; `npx tsc -b --noEmit`, `npm test`
  (523), `npm run build` all green with no test-file modifications; a
  compile-only proof in a new small test file showing a non-Card item
  type flowing through Zone/deal/shuffle/draw. Review, docs note,
  commit offer.

## Run budget
2 cycles (expect 1).
