# The card engine

A reusable, framework-free foundation for multiplayer card games in Pips —
built to support Rummy next, and Golf, Crazy Eights, Hearts, Spades, and
Phase 10 after that — without each one reimplementing decks, hands, dealing,
hidden information, turn order, and PeerJS synchronization from scratch.

Lives under `src/engine/` (the game-agnostic core: RNG, turn order, host
sync — promoted out of `src/card-engine/` in Aug 2026 so non-card games like
Battleship can build on it), `src/card-engine/` (the card-specific layer) and
`src/card-games/<game>/` (a specific game's rules on top of it — currently
just `src/card-games/rummy/`, a minimal proof harness, not full Rummy).

It does **not** touch, replace, or share code with `src/games/` (Farkle,
Yahtzee, Tic Tac Toe, Hangman) or `src/state/room.ts` — see [Migration
work](#migration-work-on-existing-games) at the end.

## 1. What was abstracted

Seven small modules, each independently testable and none aware of any
specific game's rules:

| Module | File | Owns |
|---|---|---|
| Cards | `card-engine/cards.ts` | `Card` identity (`id`/`suit`/`rank`/`deckIndex`/`meta`), `SUITS`/`RANKS`, `cardsEqual`/`findCard`/`removeCard` |
| Deck | `card-engine/deck.ts` | `createStandardDeck` (multi-deck, jokers), `shuffleDeck` (host-seeded), `dealCards`/`drawCard` |
| RNG | `engine/rng.ts` | `createRng(seed)` — deterministic mulberry32, so shuffles are host-authoritative and testable |
| Zones | `card-engine/zones.ts` | The generic `Zone` container (hand/discard/stock/anything) and card-movement ops |
| Turn engine | `engine/turn-engine.ts` | Generic turn order: current player, direction, skip/extra-turn, an opaque `phase` slot |
| Sync | `engine/sync.ts` | Host-authoritative action pipeline, public/private state split, revision numbers, reconnect snapshots |
| Bot seam | `card-engine/bot.ts` | The one function a house player calls — goes through the exact same path as a human |

Every module is pure functions over plain data. No classes, no React, no
PeerJS import anywhere in `card-engine/` — confirmed by review at every
milestone (`grep` for framework imports came back empty every time).

### Card identity

```ts
interface Card {
  id: string            // opaque, e.g. "c0".."c51" — never parsed, never derived from suit/rank
  suit: Suit             // 'clubs' | 'diamonds' | 'hearts' | 'spades' | 'joker'
  rank: Rank              // 'A'..'K' | 'JOKER'
  deckIndex: number        // which physical deck (0-based) — lets a 2-deck game tell its two 7♥s apart
  meta?: Record<string, unknown>  // game-specific tag space (e.g. { wild: true }) the engine never reads
}
```

Identity is `id` alone — `cardsEqual` only ever compares ids. There is
deliberately no numeric `value`/rank-ordering field; whether Ace is high or
low, what a wild card substitutes for, and every other rule question is a
specific game's problem, not the engine's.

### Zones — one shape, four names

`Hand`, `DiscardPile`, `PlayerZone`, and `PublicZone` are not four types —
they're the same `Zone` shape, produced by four factory functions:

```ts
interface Zone {
  id: string
  ownerId: string | null    // a player id, or null for a zone nobody owns
  visibility: 'private' | 'public'
  cards: Card[]               // index 0 = bottom, last index = top, always
}

createHand(playerId)                              // private, owned
createDiscardPile(id = 'discard')                  // public, unowned
createPlayerZone(playerId, name, visibility)        // e.g. a per-player "melds laid down" area
createPublicZone(name, visibility = 'public')       // e.g. the stock pile (often visibility: 'private')
```

One data structure means one set of operations to learn and one set of
conservation guarantees to trust: `addCards`, `removeCardsById`, `moveCards`,
`topCard`, `cardCount`, `setZoneVisibility`, `recyclePile` (for
"reshuffle the discard back into a fresh stock, keeping the current top
card(s) behind"). All pure, all immutable — no function ever mutates a
`Zone` or its `cards` array in place.

**Known limitation:** visibility is zone-level only. There's no per-card
face-up/face-down flag within a zone. That's fine for Rummy (a hand is
uniformly private, a discard pile uniformly public, a stock uniformly
hidden) but will matter for a game like Golf, where some of a player's own
cards are face-down even to that player. Not built now — deliberately, per
"don't build abstractions for hypothetical games" — but it's the first
thing a Golf implementation will need to add.

### Turn engine

```ts
interface TurnState<Phase extends string> {
  playerOrder: string[]
  currentIndex: number
  direction: 1 | -1
  phase: Phase          // opaque — the engine never reads or validates this
  turnNumber: number
}

createTurnState(playerOrder, initialPhase)
currentPlayer(state)
advanceTurn(state, nextPhase)      // next player in `direction`, turnNumber +1
skipNext(state, nextPhase)          // two steps in `direction`, turnNumber +1 (one player skipped)
extraTurn(state, nextPhase)          // same player again, turnNumber +1
reverseDirection(state)               // flips direction only — turnNumber unchanged
setPhase(state, phase)                 // sub-turn phase change — nothing else moves
```

`Phase` is a generic type parameter. `turn-engine.ts` contains no game-specific
string anywhere (verified by grepping the module for "draw", "meld",
"discard", "knock", "score" — zero matches). Rummy layers `'draw' | 'discard'`
on top of it as its own type; a future Hearts implementation would layer
something else entirely, with zero changes to this module.

## 2. The state/message model

This is the piece that makes host-authoritative PeerJS multiplayer work
without a server. Everything here is plain, JSON-serializable data.

```ts
// Lives ONLY on the host. Contains every player's private state — never sent
// as a whole over the wire.
interface HostSession<TPublicState, TPrivateState> {
  revision: number
  publicState: TPublicState
  privateStates: Record<string, TPrivateState>   // keyed by playerId
}

// What one specific player is allowed to receive. This is BOTH the normal
// per-move push to a player AND the reconnect-snapshot response — same
// shape, same function, by design (see "Reconnection" below).
interface SnapshotMessage<TPublicState, TPrivateState> {
  kind: 'snapshot'
  revision: number
  publicState: TPublicState
  privateState: TPrivateState     // only THIS player's own state
}
```

### The action pipeline (host authority)

A game defines one function — an `ActionValidator` — and everything else is
generic:

```ts
type ActionValidator<TPublicState, TPrivateState, TAction> = (
  session: HostSession<TPublicState, TPrivateState>,
  playerId: string,
  action: TAction,
) => ActionOutcome<TPublicState, TPrivateState>
// ActionOutcome = { ok: boolean; reason?: string; publicState?: ...; privateStates?: ... }
```

```
player submits an action
        │
        ▼
applyAction(session, playerId, action, validate)
        │
        ├─ validate() decides: legal? what does state become?
        │
        ├─ REJECTED → session returned UNCHANGED (same object, same revision)
        │
        └─ ACCEPTED → new session, revision + 1
                       (the ONLY place a revision number is ever incremented)
```

`applyAction` is the single mechanical chokepoint. A game's validator never
touches `revision` directly and can't get it wrong. It also can't silently
drop a player: `applyAction` verifies every player id present in the
*input* session's `privateStates` is still present in the validator's
returned `privateStates` before accepting the outcome — a validator may add
a new player, but never lose an existing one.

### Hidden information

`deriveSnapshot(session, playerId)` is the only function that reaches into
`session.privateStates`, and it reads exactly one entry — the requesting
player's own. Every other player's data is structurally unreachable from
whatever it returns. This was adversarially tested by walking a
`SnapshotMessage` with `Reflect.ownKeys` (catching symbol keys and
non-enumerable properties, not just `JSON.stringify`) and cross-checking
object identity against the full `privateStates` map — no leak found across
three separate reviews (M3's own review, plus re-verification in M5's).

Two defensive details worth knowing: `deriveSnapshot` looks up `playerId` via
`Object.hasOwn`, not a raw bracket access — a raw `session.privateStates[id]`
would walk the prototype chain and return a live `Function` for an id like
`'constructor'` (found and fixed in M3's review). And `isJsonSerializable(value)`
exists as a test-support utility — a recursive check that rejects anything
that isn't plain JSON-safe data (functions, `undefined`, class instances,
`Date`/`Map`/`Set`, array subclasses, circular references) — for asserting a
game's public/private state shapes are actually safe to put on the wire.

### Reconnection

There's no replay log and no delta format. A reconnecting player gets
exactly the same thing a normal per-move update gives them: a fresh
`deriveSnapshot(session, playerId)` call. Current public state, their own
current private state, and the revision — that's the entire reconnection
story, deliberately, per "prefer snapshot recovery over replaying every
missed action."

`shouldAcceptUpdate(localRevision, incomingRevision)` is the client-side
counterpart: `incomingRevision > localRevision`. Use it to discard a
stale/duplicate/out-of-order snapshot arriving after a newer one.

**Landmine to know about:** a real session's first revision is `0`
(`createHostSession` starts there). A client that initializes its own
tracked "local revision" to `0` will discard the very first snapshot it
ever receives — `shouldAcceptUpdate(0, 0)` is correctly `false` (not
"newer"). **Initialize a client's local revision sentinel to `-1`, not `0`.**
This is documented directly above `shouldAcceptUpdate` in `sync.ts` too.

### House player seam

```ts
function runBotTurn(session, playerId, strategy, validate) {
  const view = deriveSnapshot(session, playerId)          // same view a human gets
  const action = strategy(view.publicState, view.privateState, playerId)
  return applyAction(session, playerId, action, validate)  // same path a human's action takes
}
```

That's the entire module. A bot's `strategy` function sees only what a real
player's client would see, and its chosen action is submitted through the
identical validation path — no bypass, no special case. All the actual
"how good is this bot" logic belongs in a specific game's own strategy
function (e.g. a future `src/card-games/rummy/bot-strategy.ts`), never in
`bot.ts` itself.

## 3. How a new card game plugs in

Follow the shape of `src/card-games/rummy/` (currently the only example,
deliberately minimal — see [§5](#rummy-readiness--what-exists-vs-what-doesnt)):

1. **Define your public/private state and action types.** Plain interfaces,
   composed from `card-engine` primitives (a `Zone` for each pile, a
   `TurnState<YourPhase>` for turn order) plus whatever your game needs on
   top (score totals, meld areas, whatever).
2. **Write one `createXGame(...)` function** that builds the initial
   `HostSession` — shuffle a deck (`shuffleDeck(deck, createRng(seed))`,
   always host-seeded, never `Math.random()` inside the engine), deal into
   `Zone`s, build your initial `TurnState`, call `createHostSession`.
3. **Write one `ActionValidator`** — a single function, `(session, playerId,
   action) => outcome`, that is your entire rules engine: is this action
   legal right now, and what does state become if so. This is where "is
   this a valid run," "has a player knocked," "are hearts broken," and every
   other game-specific rule lives — the `card-engine` never sees any of it.
4. **Wrap `applyAction`/`runBotTurn` if (and only if) you have state that
   must be visible to nobody** (see the stock-pile pattern below) — most
   games won't need this; call `applyAction`/`runBotTurn` directly otherwise.
5. **Wire it into the app's PeerJS transport** (`src/net/peer.ts`) and
   screen-routing (`src/App.tsx`/`src/state/room.ts`) — **not built yet**.
   This charter's scope stopped at "the engine works and is tested," not
   "a card game is playable in the live lobby." That's the next task.

### The stock-pile pattern (visible to nobody)

`HostSession<TPublic, TPrivate>` has exactly two visibility levels: everyone,
or exactly one player. Real games often need a third: **visible to nobody**
— Rummy's stock, a face-down draw pile, an undealt deck. There's no
first-class slot for that in `sync.ts` by design (see
[§4](#4-architectural-decisions--limitations)), so Rummy's harness
establishes the pattern every future game with this need should copy:

```ts
interface RummySession {
  session: HostSession<RummyPublicState, RummyPrivateState>
  stock: Zone   // lives OUTSIDE the generic session — structurally unreachable
}              // from any SnapshotMessage, not just filtered out of one

function applyRummyAction(rummy, playerId, action) {
  let candidateStock = rummy.stock
  const validate = makeValidator(rummy.stock, (s) => { candidateStock = s })
  const { session, outcome } = applyAction(rummy.session, playerId, action, validate)
  const stock = outcome.ok ? candidateStock : rummy.stock   // <-- only commit on real success
  return { rummy: { session, stock }, outcome }
}
```

The critical detail, found by review and worth repeating for whoever copies
this pattern next: **only trust the validator's reported new hidden-state
after confirming `outcome.ok` on the OUTER call**, not inside the validator
itself. `sync.ts`'s own completeness checks can still reject an outcome the
validator thought was fine (e.g. if a validator bug drops a player from
`privateStates`) — if you commit the hidden-state change before that gate
runs, a rejected action can silently corrupt state anyway. Do the "did this
actually succeed" check once, at the boundary, after the real call returns.

## 4. Architectural decisions & limitations

Things Rummy (and whoever builds the next game after it) should know before
building further:

- **Two visibility levels, not three.** `sync.ts` only models "everyone" and
  "exactly one player." Hidden-from-everyone state (stock piles, undealt
  decks) needs the wrapper pattern above, on a per-game basis. This was a
  deliberate scope decision, not an oversight: extending `sync.ts`'s type
  signature to a three-way split would ripple through every function and
  every game that uses it, for a need only some games have. The wrapper
  pattern is proven (M5's review fuzzed it hard) and costs one small file
  per game that needs it.
- **Zone visibility is all-or-nothing per zone**, not per-card. No
  face-up/face-down within a single zone. Fine for Rummy; Golf will need to
  extend this.
- **No stock recycling in the Rummy harness.** `zones.ts` already has
  `recyclePile` (reshuffle discard back into stock) — it's just not wired
  into `src/card-games/rummy/rules.ts` yet. `DRAW_FROM_STOCK` on an empty
  stock is simply rejected with `reason: 'stock is empty'`. Real Rummy needs
  this; it's a small addition (call `recyclePile` from the validator when
  `topCard(stock)` is `undefined`, keeping the current discard top behind),
  deliberately deferred because it's a game rule, not an engine gap.
- **No melds, sets, runs, wild-card substitution, knocking, scoring, or
  multiple rounds anywhere in this codebase yet.** The Rummy harness proves
  drawing/discarding/turn-flow only, per this charter's explicit scope. All
  of that is the next task's job, and belongs entirely in
  `src/card-games/rummy/rules.ts` (validator logic) plus a new
  `src/card-games/rummy/scoring.ts` — never in `card-engine/`.
- **Randomness is always host-seeded, never ambient.** Every shuffle takes
  an explicit `randomFn`/seeded `createRng(seed)` — nothing in
  `card-engine/` calls `Math.random()`. A real game's host should generate
  its seed once (e.g. from `Date.now()` or `crypto.getRandomValues`) and
  never let a guest shuffle independently.
- **`turnNumber` counts turn *transitions*, not "full laps of the table."**
  `advanceTurn`/`skipNext`/`extraTurn` each add exactly 1; `reverseDirection`
  and `setPhase` add 0. A 2-player game's `skipNext` lands back on the same
  player who called it (two steps forward with 2 players wraps to yourself)
  — correct per spec, but worth knowing before wiring in a "skip" card for a
  2-player game expecting it to behave like "pass."
- **`shouldAcceptUpdate(0, 0)` is `false` by design** — see the reconnection
  landmine above. Client code must track its local revision starting at
  `-1`, not `0`.
- **PeerJS transport reuse.** This whole layer defines message *shapes*
  (`SnapshotMessage`, action payloads) but deliberately does not touch
  `src/net/peer.ts`'s actual PeerJS host/guest connection code. The existing
  `createHost`/`joinHost` broadcast/send primitives are the right transport
  to carry `sync.ts`'s messages once a card game is wired into the live
  app — no new transport needed, no changes made to the existing one.

## 5. Rummy readiness — what exists vs. what doesn't

**Exists and tested (165 tests total across the whole card-engine):**
dealing, drawing from stock or discard, a private hand per player, a public
discard pile, discarding to end a turn, turn advancement between exactly 2
players, hidden-information isolation, a working house-player turn, and a
verified no-card-lost-or-duplicated guarantee under both scripted and
2000-action randomized play.

**Explicitly not built** (per this charter's scope — the *next* task):
sets, runs, laying down melds, adding to existing melds, knocking, hand/round
scoring, multiple rounds, stock recycling, and any UI. `src/card-games/rummy/`
today is a 2-file, ~140-line proof harness (`state.ts` + `rules.ts`) plus its
test suite — not a playable game. Building full Rummy means extending
`rules.ts`'s validator with meld logic, adding a `scoring.ts`, adding a
round/game-over concept to `RummyPublicState`, and — separately — actually
wiring a card-game session into `src/App.tsx`'s screen routing and
`src/net/peer.ts`'s live PeerJS connection, none of which exists yet.

## Migration work on existing games

**None.** `src/games/` (Farkle, Yahtzee, Tic Tac Toe, Hangman — dice/word
games, not card games) and `src/state/room.ts` (their shared dice-game
reducer and `Action` union) were never touched by any milestone in this
charter. They don't use `card-engine/` and `card-engine/` doesn't know they
exist. This was a deliberate charter decision (see `CHARTER.md`'s ambiguity
resolutions): the existing dice-game `Action` union in `src/types.ts` is
specific to those four games, not a generic action bus, so card games get
their own parallel `ActionValidator` pattern in `sync.ts` rather than being
forced to fit into it. `npx tsc -b --noEmit` and `npm run build` were
re-verified clean after every single milestone specifically to confirm this
— the existing app never broke.

## Where things live

```
src/engine/                             Game-agnostic core — no card imports;
                                        Battleship/Wahoo build on this too
  rng.ts / rng.test.ts                  Seeded PRNG
  turn-engine.ts / turn-engine.test.ts  Generic turn order
  sync.ts / sync.test.ts                Host authority, hidden info, reconnection

src/card-engine/                        Card-specific layer, imports src/engine/
  cards.ts / cards.test.ts              Card identity
  deck.ts / deck.test.ts                Standard deck creation, shuffle, deal
  zones.ts / zones.test.ts              Hand/DiscardPile/PlayerZone/PublicZone
  bot.ts / bot.test.ts                  House-player seam (generic; promotion
                                        candidate when a non-card game needs it)

src/card-games/
  rummy/
    state.ts                            Public/private state, RummySession, createRummyGame
    rules.ts                            ActionValidator, the stock-closure wrappers
    rummy.test.ts                       End-to-end integration proof (not a UI)
```
