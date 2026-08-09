# Spec 16: item-generic zones and deck helpers

Type-level generalization so a future dominoes game can reuse the
card-engine containers with domino tiles. ZERO behavior change. Modify
ONLY `src/card-engine/zones.ts` and `src/card-engine/deck.ts`, plus create
ONE new test file `src/card-engine/generic-items.test.ts`.

## zones.ts

Make the zone machinery generic over the item type, with `Card` as the
default so no existing call site changes:

```ts
export interface Zone<T extends { id: string } = Card> {
  id: string
  ownerId: string | null
  visibility: ZoneVisibility
  cards: T[]        // field name unchanged — wire format and call sites stay identical
}
```

Every function gains the same parameter `<T extends { id: string } = Card>`
and uses `Zone<T>` / `T[]` in place of `Zone` / `Card[]`:
`createHand`, `createDiscardPile`, `createPlayerZone`, `createPublicZone`,
`addCards`, `removeCardsById`, `moveCards`, `topCard`, `cardCount`,
`setZoneVisibility`, `recyclePile`. Bodies are untouched —
`removeCardsById` already reads only `.id`. Keep the `Card` type import
(it becomes the default type argument).

## deck.ts

`shuffleDeck<T>(cards: T[], randomFn)`, `dealCards<T>(cards: T[], count)`,
`drawCard<T>(cards: T[])` — plain `<T>`, no constraint (pure array ops),
parameter and return-field names unchanged. `createStandardDeck` and its
options stay exactly as they are.

## generic-items.test.ts (new)

A small vitest file proving a non-Card item flows through, e.g.:

```ts
interface Tile { id: string; low: number; high: number }
```

- build a `Tile[]`, `shuffleDeck(tiles, createRng(1))` (import createRng
  from `../engine/rng.ts`), assert deterministic order and same multiset;
- `dealCards` / `drawCard` on tiles: counts and remainder correct;
- `createPublicZone<Tile>('boneyard', 'private')`, `addCards`,
  `moveCards` between two tile zones by id, `removeCardsById`, `topCard`,
  `cardCount` — assert contents;
- one type-level line asserting the default still works:
  a `Zone` (no type argument) accepts `Card[]` from
  `createStandardDeck()`.

## Verify

```
npx tsc -b --noEmit
npm test        # 523 existing pass UNCHANGED + the new file
npm run build
```

If any existing test file needs edits to stay green, STOP and report —
that means the generalization changed an inference somewhere and the
approach needs the lead, not a workaround.

## Forbidden

Touching cards.ts, sync/bot/turn-engine, any game module, any existing
test, any screen; renaming fields or parameters; behavior changes; git.

## Report

(1) commands + verbatim tallies; (2) signature list changed; (3)
deviations or "no deviations".
