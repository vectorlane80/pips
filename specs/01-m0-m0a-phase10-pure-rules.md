# Spec 01 — M0 (widen card-engine types) + M0a (Phase 10 pure rules)

You are implementing ONE slice for the Pips repo (React+TS+Vite, PeerJS
multiplayer, no backend). Read `CLAUDE.md` at the repo root first — it is
binding. Read `CHARTER.md` for full context if you want it, but everything
you need to implement is decision-locked below; do not re-derive or
second-guess these choices.

Work only in the files listed under "Files you own" below. Do not touch
anything else. Do not run `git commit` — leave changes unstaged/uncommitted
for the lead to review and commit.

## Part 1 — M0: widen `card-engine/cards.ts` types (pure type change)

File: `src/card-engine/cards.ts`

Change:
```ts
export type Suit = 'clubs' | 'diamonds' | 'hearts' | 'spades' | 'joker'
export type Rank = 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K' | 'JOKER'
```
to:
```ts
export type Suit = string
export type Rank = string
```

Do NOT change anything else in this file — `SUITS`, `RANKS`, `Card`,
`cardsEqual`, `findCard`, `removeCard` all stay byte-identical. `SUITS`/
`RANKS` keep producing the exact same runtime values as before; only their
declared element type widens (they're still assignable to `string[]`).

This is a pure type-level change with zero behavior change. After making
it:
1. Run `npx tsc -b --noEmit` from the repo root. It must stay clean. If any
   other file breaks (e.g. a `switch` over `Suit`/`Rank` that TypeScript
   used to exhaustiveness-check), that is expected and fine — TypeScript
   will simply stop flagging it as exhaustive, it will NOT become a type
   error. If you see an actual new type error anywhere, stop and report it
   in your final report rather than "fixing" it by guessing — it would mean
   this change has a side effect broader than described here, which
   shouldn't happen.
2. Run the full test suite (`npm test`). Every existing test must still
   pass, unmodified. Do not touch any existing test file.

## Part 2 — M0a: Phase 10 pure rules module (new files)

### Files you own (create these, nothing else)
```
src/card-games/phase10/deck.ts
src/card-games/phase10/deck.test.ts
src/card-games/phase10/phases.ts
src/card-games/phase10/phases.test.ts
src/card-games/phase10/classify.ts
src/card-games/phase10/classify.test.ts
```

Do not import from React, from `src/screens/`, `src/components/`, or from
`src/games/`/`src/state/room.ts` (the legacy dice-game system) — this
module must not know those exist, per `CLAUDE.md`.

Import `Card` from `../../card-engine/cards.ts`. Use vitest (`describe`/
`it`/`expect`), same convention as `src/card-games/rummy/*.test.ts` — look
at `src/card-games/rummy/melds.test.ts` for the style if you want a
reference (do not copy Rummy logic, this is a different game).

### `deck.ts`

```ts
export function createPhase10Deck(): Card[]
```

Build exactly 108 cards, no options/parameters:
- For each color in `['red', 'blue', 'green', 'yellow']`, for each number
  1 through 12, create **two** cards: `{ id: <unique>, suit: color, rank:
  String(number), deckIndex: 0, meta: { kind: 'number' } }`. That's
  4 colors × 12 numbers × 2 copies = 96 cards.
- 4 Skip cards: `{ id: <unique>, suit: 'special', rank: 'SKIP', deckIndex:
  0, meta: { kind: 'skip' } }`.
- 8 Wild cards: `{ id: <unique>, suit: 'special', rank: 'WILD', deckIndex:
  0, meta: { kind: 'wild' } }`.
- Total: 108 cards. `id` values must be unique strings across the whole
  deck (e.g. `p10-0`, `p10-1`, ... `p10-107`, in creation order — exact
  format doesn't matter, uniqueness does).

Tests: total count is 108; exactly 24 cards per color; exactly 2 cards per
(color, number) pair; exactly 4 Skip and 8 Wild; every `id` is unique;
every card's `meta.kind` is one of `'number'|'skip'|'wild'` and matches
its `rank` (`'skip'` iff `rank==='SKIP'`, `'wild'` iff `rank==='WILD'`,
`'number'` otherwise with `rank` being `'1'`..`'12'` and `suit` being one
of the four colors).

### `phases.ts`

```ts
export type PhasePartType = 'set' | 'run' | 'color'
export interface PhasePart {
  type: PhasePartType
  count: number
}
export interface PhaseRequirement {
  phase: number       // 1-10
  label: string        // exact wording below, for UI display
  parts: PhasePart[]   // 1 or 2 parts
}
export const PHASES: PhaseRequirement[]
```

`PHASES` must be exactly this, in this order (index 0 = phase 1):

| phase | label | parts |
|---|---|---|
| 1 | `2 sets of 3` | `[{type:'set',count:3},{type:'set',count:3}]` |
| 2 | `1 set of 3 + 1 run of 4` | `[{type:'set',count:3},{type:'run',count:4}]` |
| 3 | `1 set of 4 + 1 run of 4` | `[{type:'set',count:4},{type:'run',count:4}]` |
| 4 | `1 run of 7` | `[{type:'run',count:7}]` |
| 5 | `1 run of 8` | `[{type:'run',count:8}]` |
| 6 | `1 run of 9` | `[{type:'run',count:9}]` |
| 7 | `2 sets of 4` | `[{type:'set',count:4},{type:'set',count:4}]` |
| 8 | `7 cards of one color` | `[{type:'color',count:7}]` |
| 9 | `1 set of 5 + 1 set of 2` | `[{type:'set',count:5},{type:'set',count:2}]` |
| 10 | `1 set of 5 + 1 set of 3` | `[{type:'set',count:5},{type:'set',count:3}]` |

Tests: `PHASES.length === 10`; each entry's `phase` matches its 1-based
index; spot-check a few labels/parts against the table exactly (e.g. phase
8's single part is `{type:'color',count:7}`, phase 10 is `set:5 + set:3`
— NOT `set:4 + set:3`, that would be wrong).

### `classify.ts`

This is the real logic. Card kind is read from `card.meta?.kind` — never
parse `rank`/`suit` strings to infer kind (a wild's `rank` is the literal
string `'WILD'`, not a number, so treat `meta.kind` as the source of
truth throughout).

```ts
export type GroupType = 'set' | 'run' | 'color'
export interface PhaseGroup {
  type: GroupType
  cards: Card[]
}
```

**Helper predicates (exported, used both for lay-down and for hitting an
existing group later in M0b — no exact-count constraint here, that's a
separate wrapper):**

```ts
export function isValidSet(cards: Card[]): boolean
```
True iff: `cards.length >= 2`, at least one card has `meta.kind ===
'number'`, and every `meta.kind === 'number'` card among them has the
same `rank` (i.e. same number — wilds impose no constraint, they always
fit). A group made entirely of wilds is NOT valid (must have ≥1 natural
card — official rule).

```ts
export function isValidRun(cards: Card[]): boolean
```
True iff a contiguous run of consecutive integers in `[1,12]` (no
wraparound — 12 is not adjacent to 1) can be formed using every card in
`cards`, with wilds filling any gaps or extending either end. Algorithm
(implement exactly this, it's already fully worked out):
1. `naturals = cards.filter(c => c.meta?.kind === 'number')`,
   `wildCount = cards.filter(c => c.meta?.kind === 'wild').length`.
2. If any two naturals share the same `rank` (same number), return
   `false` — a run can't repeat a number.
3. If `naturals.length === 0`: valid iff `cards.length >= 1` (an
   all-wild group can represent any run of that length, since 1..12 has
   plenty of room for any Phase 10 run length, max 9) — return
   `cards.length >= 1`.
4. Let `numbers = naturals.map(c => Number(c.rank))`, `minNum =
   Math.min(...numbers)`, `maxNum = Math.max(...numbers)`.
5. `span = maxNum - minNum + 1` (the width the naturals themselves
   already occupy). If `span > cards.length`, return `false` (naturals
   are spread wider than the total cards available to fill the run).
6. `gapsToFill = span - naturals.length` (missing integers strictly
   inside `[minNum, maxNum]`). If `gapsToFill > wildCount`, return
   `false`.
7. `extraWilds = wildCount - gapsToFill` (leftover wilds after filling
   internal gaps — these extend the run beyond `[minNum, maxNum]`).
8. `roomBefore = minNum - 1`, `roomAfter = 12 - maxNum` (how far the run
   can extend left/right and stay within `[1,12]`).
9. Return `extraWilds <= roomBefore + roomAfter`.

```ts
export function isValidColorGroup(cards: Card[]): boolean
```
True iff: `cards.length >= 1`, at least one card has `meta.kind ===
'number'`, and every `meta.kind === 'number'` card among them has the
same `suit` (color). Skip cards are never part of any group (see M0b —
they're never selectable for laying/hitting at all, only discarded); you
don't need to special-case rejecting them here, but you may assume
`classifyGroup`/callers never pass a Skip card into these functions.

**Exact-count wrapper (used for the actual "lay this phase" check):**

```ts
export function classifyGroup(cards: Card[], type: GroupType, exactCount: number): boolean
```
`cards.length === exactCount` AND the matching `isValid*` predicate above
for `type` (`'set'`→`isValidSet`, `'run'`→`isValidRun`,
`'color'`→`isValidColorGroup`).

**Whole-phase classifier:**

```ts
export function classifyPhaseHand(cards: Card[], requirement: PhaseRequirement): { valid: boolean; groups?: PhaseGroup[] }
```
- If `cards.length !== requirement.parts.reduce((sum, p) => sum + p.count, 0)`, return `{ valid: false }` immediately (wrong total card count — no partition search needed).
- If `requirement.parts.length === 1`: `{ valid: classifyGroup(cards, requirement.parts[0].type, requirement.parts[0].count), groups: [{type: requirement.parts[0].type, cards}] }` if valid, else `{valid:false}`.
- If `requirement.parts.length === 2`: search for a way to split `cards`
  into two disjoint groups, `group0` of size `requirement.parts[0].count`
  and `group1` (the remaining cards), such that `classifyGroup(group0,
  requirement.parts[0].type, requirement.parts[0].count)` and
  `classifyGroup(group1, requirement.parts[1].type,
  requirement.parts[1].count)` are both true. Brute-force every
  combination of indices of size `requirement.parts[0].count` chosen from
  `cards` as `group0` (max hand-relevant size here is ~8-9 cards, so a
  plain combinatorial loop — no need for anything fancier — is fine
  performance-wise). Return the first valid split found as `{valid:true,
  groups:[{type:parts[0].type,cards:group0},{type:parts[1].type,
  cards:group1}]}`. If no split works, `{valid:false}`.
- `requirement.parts.length` is never anything other than 1 or 2 for this
  game's 10 phases — no need to handle other lengths.

### Tests for `classify.ts` — cover at least these cases explicitly

Use literal `Card` fixtures (`{id, suit, rank, deckIndex:0, meta:{kind:...}}`),
same convention as Rummy's test fixtures.

- `isValidSet`: 3 naturals same number different colors → true; 3 naturals
  where one differs → false; 2 naturals + 1 wild same-number-implied →
  true; all-wild (e.g. 3 wilds, 0 naturals) → **false** (no natural card);
  single card → false (below the `>=2` floor).
- `isValidRun`: `[3,4,5,6]` same/different colors (colors don't matter for
  runs) → true; `[3,4,6]` (gap, no wild) → false; `[3,4,_,6]` with 1 wild
  filling the gap → true; naturals `[11,12]` + 2 wilds extending
  downward to make a run of 4 (`9,10,11,12` via wilds at 9,10) → true;
  naturals `[11,12]` + wilds trying to extend past 12 (e.g. needing a
  13) → false (no wraparound, hits the `[1,12]` ceiling); two naturals
  with the same number (e.g. two `'5'`s) → false; an all-wild group of
  length 9 → true (`extraWilds` fits inside `[1,12]`'s 12-wide room).
- `isValidColorGroup`: naturals all one color → true; naturals split
  across two colors → false; naturals all one color + wilds → true;
  all-wild → false (no natural).
- `classifyGroup`: same as above but also checks `cards.length ===
  exactCount` rejects a too-long or too-short group even if it would
  otherwise be valid.
- `classifyPhaseHand`:
  - Phase 1 (2 sets of 3): 6 cards forming two valid sets of 3 (e.g. three
    `'5'`s of different colors + three `'9'`s of different colors) →
    valid, `groups.length===2`, both `type:'set'`.
  - Phase 1 with a wild that must be split correctly between the two sets
    to work (i.e. only one of the two possible 3/3 partitions is valid) →
    valid (proves the search doesn't just try the "obvious" split).
  - Phase 1 with 6 cards that can't split into two valid sets of 3 at all
    → invalid.
  - Wrong total count (e.g. 5 cards offered for a 6-card phase) → invalid,
    immediately, no partition search.
  - Phase 8 (7 cards one color): 7 same-color naturals → valid single
    group; 7 cards with one off-color natural and no wild to cover it →
    invalid.
  - Phase 4 (run of 7): 7 cards forming a valid run with 2 wilds placed
    correctly → valid.

## Verification (you run this yourself before reporting)

From the repo root (`/Users/charlie/Desktop/Projects/pips/.claude/worktrees/phase10`):
```
npx tsc -b --noEmit
npm test
npm run build
```
All three must be clean/green. Report the exact commands you ran and their
exact output (not a paraphrase) in your final report. If anything fails,
fix it before reporting — do not report success with a known-failing
command.

## Report format

End your work with a report containing:
1. Every file created or modified, with a one-line description of each.
2. The exact output of `npx tsc -b --noEmit`, `npm test` (just the summary
   line with pass/fail counts), and `npm run build`.
3. Any place you had to make a judgment call not fully specified above
   (there shouldn't be any — if you find one, say so explicitly rather
   than silently picking something).
4. Confirm you did not modify any file outside "Files you own" above and
   did not run `git commit`.
