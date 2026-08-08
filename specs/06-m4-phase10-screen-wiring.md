# Spec 06 — M4: Phase 10 screen + App.tsx/Landing.tsx wiring

Read `CLAUDE.md` first — binding. This is the largest slice. Read, in
full, before writing anything:
- `src/screens/RummyTable.tsx` + `.css` — your primary structural
  pattern reference (three-band layout, status-line computation,
  selection state, action-button gating computed by calling the real
  validation predicates in the UI layer, sub-components colocated in the
  same file).
- `src/screens/RummyRoom.tsx`, `RummyResults.tsx`, `RummyRulesOverlay.tsx`
  — pattern references for the three smaller screens.
- `src/App.tsx` — read the ENTIRE Rummy section (search `Rummy` — state,
  refs, `startRummyHost`/`startRummyGuest`/`addRummyHouseBot`/
  `rummyDispatch`/`rummyRematch`/`runRummyBot`/`runRummyBotsIfNeeded`,
  and the render branches at the bottom). This is your wiring pattern —
  Phase 10 gets an exact parallel structure, third branch alongside dice
  games and Rummy, per `CHARTER.md` ambiguity resolution 7.
- `src/screens/Landing.tsx` — the Rummy shelf tile (search `onPickRummy`).
- `src/card-games/phase10/{state,rules,bot}.ts` — the real exported
  types/functions this screen and wiring must use
  (`Phase10PublicState`, `Phase10PrivateState`, `Phase10Action`,
  `Phase10Session`, `createPhase10Game`, `applyPhase10Action`,
  `runPhase10BotTurn`, `phase10BotStrategy`, `PHASES` from `./phases.ts`).
- `src/components/Phase10Card.tsx`/`.css` (M3, already built) — the
  card-visual components this screen renders.
- `Design Handoff/design_handoff_pips 2/PHASE10.md` — the full design
  spec (layout, ladder, interaction model) — read it yourself, it's not
  fully re-quoted here.

## Files you own
```
src/screens/Phase10Table.tsx
src/screens/Phase10Table.css
src/screens/Phase10Room.tsx
src/screens/Phase10Results.tsx
src/screens/Phase10RulesOverlay.tsx
```
Plus edits to:
```
src/App.tsx        (add a parallel Phase 10 session branch, third alongside dice games and Rummy)
src/screens/Landing.tsx   (add a Phase 10 shelf tile + onPickPhase10 prop)
```
Do not modify any Rummy or dice-game file. Do not modify
`src/card-games/phase10/*` (already built) or `src/components/Phase10Card.*`
(already built) except to import from them. Do not run `git commit`.

## `Phase10Table.tsx` — the live-game screen

Same controlled-component contract as `RummyTable`: **all game state
arrives via props; only selection/hover/local-UI state is `useState`.**

```ts
export interface Phase10TableProps {
  code: string
  localPlayerId: string
  localName: string
  opponentName: string
  opponentColor: string
  opponentHandCount: number
  connection: 'connected' | 'disconnected'
  notice?: string | null
  publicState: Phase10PublicState
  hand: Card[]
  onDrawStock: () => void
  onDrawDiscard: () => void          // no index — top card only, unlike Rummy
  onLayPhase: (cardIds: string[]) => void
  onHit: (targetPlayerId: string, groupIndex: number, cardIds: string[]) => void
  onDiscard: (cardId: string) => void
  onOpenRules: () => void
  onLeave: () => void
}
```

### Layout — four bands, per PHASE10.md exactly

1. **Top band** ("their side"): opponent's fanned card backs
   (`Phase10CardBack size="fan"`, `marginLeft: i===0?0:-15`, matching
   Rummy's exact fan overlap) + name/count on the left; their laid groups
   right-aligned, each group rendered as a small cluster of `group`-sized
   `Phase10Card`s (reuse Rummy's `MeldCluster` sub-component pattern —
   colocate an equivalent `GroupCluster` in this file), each with a small
   "Phase N" caption above it in the opponent's color (`opponentColor`
   prop) — **N is the phase index the group was laid FOR, not
   necessarily the player's current phase** — track this per-group; if
   `Phase10Group` doesn't carry which phase number it was laid for, use
   the group's position combined with `publicState.phaseIdx[opponentId]`
   read at render time as a reasonable approximation and note this as a
   judgment call in your report (the actual `Phase10Group` type only
   carries `{type, zone}`, not a phase number — don't invent state that
   doesn't exist; either omit the phase number from the caption or infer
   it, your call, just document which you picked).
2. **Ladder band**: the 10-chip phase ladder, full width, **one ladder
   only** (PHASE10.md is explicit: an earlier duplicate was removed by
   design, don't add one). Build this as a colocated `PhaseLadder`
   sub-component in this file:
   - 10 chips in a row, one per `PHASES` entry (`import { PHASES } from
     '../card-games/phase10/phases.ts'`).
   - Chip fill: violet (`var(--violet)`) for the LOCAL player's current
     phase (`publicState.phaseIdx[localPlayerId] === i`), light grey for
     phases behind it (`i < phaseIdx[localPlayerId]`), white for phases
     ahead.
   - Two small dots beneath each chip: a violet dot under the chip
     matching `phaseIdx[localPlayerId]`, and a dot in `opponentColor`
     under the chip matching `phaseIdx[opponentId]` — both players'
     progress reads at a glance with no text, exactly as PHASE10.md
     specifies. (When both players are on the same phase index, both
     dots render under the same chip, side by side.)
   - Hover a chip → a fixed-height caption row below the ladder shows
     `"Phase {n} — {label}"` (from `PHASES[i].label`); a non-breaking
     space (`' '`) when nothing is hovered, so the row never
     collapses/shifts height. Implement with local `useState<number |
     null>` for the hovered index — **not** the native `title` attribute
     (PHASE10.md explicitly says native tooltips don't reliably show in
     this preview environment, implement hover-to-caption).
3. **Centre band** (bordered top and bottom, matching Rummy's
   `.rummy-centre` treatment): stock (`Phase10CardBack size="stock"`,
   `canDraw` when it's the local player's turn, draw phase, and
   `stockCount > 0`) and discard (**top card only** — render at most one
   `Phase10Card size="discard"`, or an empty-pile placeholder text when
   `discardPile.cards.length === 0`; clicking it calls `onDrawDiscard()`
   when it's legal to draw right now, same enable/disable convention as
   Rummy's stock) side by side on the left; turn chip + status line on
   the right (reuse Rummy's three-part status-line rendering pattern —
   `pre + <card> + post`, colocate an equivalent `StatusDisplay`
   sub-component and `computeStatus` function, adapted per the status
   cases below).
4. **Your band**: your laid groups (same `GroupCluster` rendering as the
   opponent's, your own color/violet) + a "Phase N — {requirement label}"
   pill (violet dot + text, reading from `PHASES[phaseIdx[localPlayerId]]`
   — no duplicate phase NUMBER redundant with the ladder, per PHASE10.md,
   but the requirement label is useful here since the ladder caption only
   shows on hover).
5. **Hand band**: "Your hand" + count, then the fan (`Phase10Card
   size="hand"`, `marginLeft: i===0?0:-26`, matching PHASE10.md's exact
   `-26px` hand overlap — note this differs from Rummy's `-26px` too,
   just confirm you used PHASE10.md's stated value, not Rummy's, in case
   they ever diverge), selection toggled on click (same `handleCardClick`
   pattern as Rummy — toggle membership in a local `selectedIds` array).
   Then the actions row.

### Status line (`computeStatus`) — cases, in priority order

1. `publicState.roundOver` → `{opponentName or 'You'} went out!` (mirror
   Rummy's exact phrasing convention, `roundWinnerId === localPlayerId ?
   'You' : opponentName`) — or, if `roundWinnerId === null` (blocked
   round), something like `"Round blocked — no cards left to draw."`.
2. Not the local player's turn → `"{opponentName}'s turn"`.
3. My turn, draw phase → `"Draw from the stock, or take the top of the
   discard."` (no reach-in prompt — this game has none).
4. My turn, discard phase, haven't laid my phase yet and have a
   selection that would complete it → nothing special needed here beyond
   the default "select cards" prompt; the button state does the real
   communicating (see below).
5. My turn, discard phase, just drew a card (mirror Rummy's `justDrawn`
   local-state + effect pattern: detect a hand-length increase since the
   last render while in discard phase, show `"You drew the "` + card +
   `"."`, cleared on the next turn-number change) — this is a nice-to-have
   matching Rummy's polish, implement it the same way Rummy does (same
   `useEffect`/`useRef` pattern) rather than skipping it.
6. Default (my turn, discard phase, nothing more specific) →
   `"Select cards to lay your phase, hit, or discard."`

### Action-button gating — mirror Rummy's "call the real validator logic
in the UI, don't just check counts" discipline exactly

```ts
function layPhaseEnabled(selectedIds: string[], hand: Card[], requirement: PhaseRequirement): boolean {
  const cards = selectedIds.map((id) => hand.find((c) => c.id === id)).filter((c): c is Card => c !== undefined)
  if (cards.length !== selectedIds.length) return false
  return classifyPhaseHand(cards, requirement).valid   // from card-games/phase10/classify.ts
}
```
Disabled once `publicState.hasLaidPhase[localPlayerId]` is already true
(button reads "Phase laid" per PHASE10.md, disabled) — mirror Rummy's
"Phase laid"/"already laid" disabled-button-with-final-state convention.

**Hitting**: only reachable once `hasLaidPhase[localPlayerId]` is true.
Per PHASE10.md's literal interaction text ("select exactly one card and
any group on the table... rings `#ffd23f` and becomes clickable"), the UI
caps a hit attempt at **exactly one selected card at a time** (even
though the underlying `Phase10Action`'s `HIT.cardIds` is an array — the
UI always calls `onHit(...)` with a single-element array). Compute, for
every group on the table (both players', via `publicState.groups`),
whether the single selected card would validly extend it:
```ts
function canHitGroup(groupCards: Card[], groupType: GroupType, selectedCard: Card): boolean {
  const combined = [...groupCards, selectedCard]
  return groupType === 'set' ? isValidSet(combined)
       : groupType === 'run' ? isValidRun(combined)
       : isValidColorGroup(combined)
}
```
(`groupCards` = `fullGroupCards(publicState.groups, publicState.hits,
targetPlayerId, groupIndex)`, imported from `card-games/phase10/state.ts`;
`isValidSet`/`isValidRun`/`isValidColorGroup` from `classify.ts`.) When
`hasLaidPhase[localPlayerId]` is true and exactly one card is selected,
ring (`box-shadow`/`border-color: var(--yellow)`, reuse Rummy's
`.rummy-meld-cluster--layoff` ring-on-hover-target convention, adapted to
a class like `.p10-group--hittable`) every group where `canHitGroup` is
true, and make it clickable → calls `onHit(targetPlayerId, groupIndex,
[selectedCard.id])` then clears the selection.

**Discard**: `selectedIds.length === 1 && publicState.turn.phase ===
'discard' && isMyTurn` (same shape as Rummy's `discardEnabled`, minus the
`obligatedCardId` check — Phase 10 has no obligation concept at all).

### Header, code chip, footnote

Mirror Rummy's exactly (`Wordmark small onClick={onLeave}`, a `"Phase
10"` game-label span, the peer-connection dot + label, the `Rules`/
`Leave` buttons, a `chip`-styled code display reading `"Phase 10 ·
{code}"`, and the same "Your hand never leaves this device" footnote).

## `Phase10Table.css`

New stylesheet, not a reuse of `RummyTable.css` (Rummy's own CSS is
scoped to `.rummy-*` class names) — but reuse the same layout *technique*:
`max-width:1260px` container, one white card
(`border:4px solid #17173a; border-radius:28px; box-shadow:0 10px 0
#17173a; padding:clamp(16px,2.4vw,26px)`), bands divided by `3px solid
#e7e7f5` rules — this is PHASE10.md's own stated layout spec ("Same shell
as Rummy"), not a guess.

## `Phase10Room.tsx`

Mirror `RummyRoom.tsx` exactly (props: `code, localName, notice,
onAddHouseBot, onLeave`), just re-labeled "Phase 10 table" and a
`Phase10RulesOverlay` instead of `RummyRulesOverlay`.

## `Phase10Results.tsx`

Mirror `RummyResults.tsx`'s structure, but with real, deliberate
differences — **do not copy Rummy's higher-wins/target convention, it is
backwards for this game:**

```ts
export interface Phase10ResultsProps {
  localPlayerId: string
  localName: string
  opponentName: string
  publicState: Phase10PublicState
  isHost: boolean
  notice?: string | null
  onRematch: () => void
  onBackToShelf: () => void
}
```
- Only renders when `publicState.matchWinnerId` is set (same guard as
  Rummy).
- Headline: `"You win!"` / `"{opponentName} wins!"` based on
  `matchWinnerId`.
- Ranked rows: **sort ASCENDING by score** (`(a,b) => a.score - b.score`
  — lower is better in this game, the opposite of Rummy's `b.score -
  a.score`). Do not display a "target" anywhere — there is none; instead
  show each player's final phase (`PHASES[phaseIdx[playerId]].phase`,
  i.e. the 1-based phase number they reached — the winner's will read 10)
  next to their score, e.g. `"Phase {n}"` where Rummy's row shows
  `"{target} target"`.
- Rematch/back-to-shelf buttons: identical to Rummy's.

## `Phase10RulesOverlay.tsx`

Mirror `RummyRulesOverlay.tsx`'s structure (a backdrop + panel, a bullet
list, a close button) but write REAL Phase 10 rules copy, matching what's
actually implemented (cross-check against `CHARTER.md` and
`src/card-games/phase10/{state,rules,scoring}.ts` — don't invent rules
that aren't real, and don't omit real ones):
- Deck: 108 cards, 24 each of red/blue/green/yellow numbered 1-12, 4
  Skip, 8 Wild.
- Deal: 10 cards each, 1 flipped to start the discard pile.
- The 10 phases, completed in order — you must complete your CURRENT
  phase before moving to the next; failing a hand means repeating the
  same phase next round.
- Turn: draw (stock, or the top of the discard — **never a Skip off the
  discard**), optionally lay your whole phase at once (once per hand),
  optionally hit cards onto any laid group (yours or the opponent's,
  only after your own phase is laid), discard exactly one card to end
  your turn.
- A discarded Skip card skips the opponent's next turn — once per player
  per round.
- Scoring (every round, based on what's LEFT in your hand if you didn't
  go out — the round winner scores 0): numbers 1-9 cost 5 points, 10-12
  cost 10, Skip costs 15, Wild costs 25. **Lower total is better.**
- First to complete Phase 10 and go out wins the match; if more than one
  player completes Phase 10 in the same hand, lowest total score wins.
- If the stock runs out, drawing recycles the discard pile (keeping the
  top card in place). If that's not possible either, the round ends with
  no score and a new one deals.

## `App.tsx` wiring

Add a parallel Phase 10 session branch — same shape as the existing Rummy
branch, third alongside dice games and Rummy (do not merge into either).
Concretely, mirror EVERY piece of Rummy's App.tsx wiring with Phase 10
equivalents:

- Imports: `createPhase10Game`, `Phase10Session`, `Phase10PublicState`,
  `Phase10PrivateState`, `Phase10Action` from `./card-games/phase10/state`;
  `applyPhase10Action`, `runPhase10BotTurn` from `./card-games/phase10/rules`;
  `phase10BotStrategy` from `./card-games/phase10/bot`; `Phase10Table`,
  `Phase10Results`, `Phase10Room` from `./screens/...`.
- A `Phase10View` type mirroring `RummyView` exactly (`{revision,
  publicState, privateState, opponentName}`).
- State/refs: `phase10Role`, `phase10Code`, `phase10LocalPlayerId`,
  `phase10OpponentId`, `phase10OpponentName`, `phase10View`,
  `phase10Connection`, `phase10Waiting` (state) +
  `phase10SessionRef`, `phase10HostRef`, `phase10GuestRef`,
  `phase10BotBusyRef`, `phase10LocalPlayerIdRef`, `phase10OpponentIdRef`,
  `phase10OpponentNameRef` (refs) — same closure-staleness discipline
  Rummy's own `docs/DEVLOG.md` explicitly flags as a real pitfall found
  in that charter (PeerJS callbacks must read refs, never React state
  directly, because the callback object is created once and never
  recreated) — **do not reintroduce that bug for Phase 10**, mirror the
  ref-based pattern exactly everywhere Rummy uses it.
- `resetToEntry()`: add Phase 10 cleanup (destroy host/guest refs, null
  out session ref, reset all Phase 10 state) alongside the existing
  Rummy cleanup.
- Helpers mirroring `rummyActorKey`/`rummyStale`/`rummyUpdateViews`/
  `startRummyHost`/`addRummyHouseBot`/`runRummyBot`/
  `runRummyBotsIfNeeded`/`startRummyGuest`/`rummyDispatch`/
  `rummyRematch` — same logic shape, Phase 10 types. **Room code prefix
  is `P10-`** (not `RM-`) — `const code = \`P10-${generateCode()}\``.
- `useEffect`s mirroring Rummy's bot-trigger effect and round-transition
  effect (same `ROUND_PAUSE_MS` timeout pattern for `START_NEXT_ROUND`
  after a round ends and the match isn't decided).
- `resolvedPhase10OpponentId` derived value, same `useMemo` pattern as
  Rummy's `resolvedRummyOpponentId`.
- **Landing routing**: the shared `onJoin` handler must now branch three
  ways: `if (code.startsWith('RM-')) startRummyGuest(code); else if
  (code.startsWith('P10-')) startPhase10Guest(code); else startGuest(code)`.
- **Render branches**: add, alongside the existing dice/Rummy branches
  (same ordering convention — waiting room, then results, then table):
  ```
  if (phase10Role === 'host' && phase10Waiting) return <Phase10Room ... />
  if (phase10View?.publicState.matchWinnerId) return <Phase10Results ... />
  if (phase10View && phase10LocalPlayerId) return <Phase10Table ... />
  ```
  Wire every `Phase10TableProps` callback to `phase10Dispatch({type:
  '...'})` calls, same pattern as Rummy's `onDrawStock`/`onDrawDiscard`/
  etc. — note `onDrawDiscard` takes **no argument** here (Phase 10's
  `DRAW_FROM_DISCARD` action has no `index` field, unlike Rummy's).
- Landing needs a new prop `onPickPhase10: () => void`, passed through
  from `App.tsx` to a new shelf tile (see below).

## `Landing.tsx` wiring

Add `onPickPhase10: () => void` to the props interface. Add a second
hand-coded shelf tile after the Rummy one (same pattern — not added to
the `GAMES`/`Game` union, a standalone `<button>` mirroring the Rummy
tile's structure exactly): label `"Phase 10"`, blurb something like
`"Ten phases, first to finish wins"`, note `"2 players"`. Pick a
background color distinct from the other five tiles' colors — Phase 10's
own card-color palette gives a natural choice: use `#6c4cff` (the
"blue" from `Phase10Card`'s `PHASE10_COLORS`) as the tile background,
white text — a reasonable, self-consistent judgment call, note it in your
report.

## Browser smoke test (do this before reporting M4 done)

Start the dev server (`npm run dev` — you have shell access, run it
yourself, don't ask the lead to do this step) and, in a real browser,
manually drive: land on the shelf, pick Phase 10 and "Play the house",
confirm the room/waiting screen, confirm the table renders with a
sensible layout (ladder, both bands, hand fan, stock/discard), draw a
card, attempt to lay a phase if your dealt hand permits it (if not,
that's fine — just confirm the button stays correctly disabled with
cards selected that don't form a valid phase), discard to end your turn,
confirm the bot takes a turn. This does not need to reach a full round —
just confirm nothing crashes and the interaction model works as
described. Report what you actually observed (screenshots not required,
but describe concretely what you saw, not "it works").

## Verification (run yourself before reporting)

```
npx tsc -b --noEmit
npm test
npm run build
```
All clean — plus the browser smoke test above. Report: every file
created/modified, every judgment call (there are several flagged above —
restate concisely, plus any you had to make that weren't flagged), exact
command output, confirmation no `git commit` was run, and a concrete
description of what you observed in the browser smoke test.
