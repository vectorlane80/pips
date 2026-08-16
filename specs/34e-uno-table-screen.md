# Spec 34e — UnoTable screen

Second of three screens specs (34d components, done → 34e this table
screen → 34f room/results/wiring). Presentational only — this component
receives all state via props and calls callback props; it does not talk to
`App.tsx`, PeerJS, or any bot logic directly.

You own EXACTLY these two new files:

- `src/screens/UnoTable.tsx`
- `src/screens/UnoTable.css`

Do NOT touch any other file. Before writing, READ in full:
`src/screens/Phase10Table.tsx` (stock-pile pattern, pendingWild/color-
choice UI, hand rendering), `src/screens/MexicanTrainTable.tsx` and
`src/screens/WahooTable.tsx` (the N-player seat-rail loop pattern — grep
`seatOrder.map`/`playerOrder.map` in both), `src/components/UnoCard.tsx`
(already built, spec 34d — this screen is its primary consumer), and
`Design Handoff/UNO.md` (the locked layout spec). Also read
`src/hooks/useSound.ts` and `src/hooks/useTurnStartSound.ts` (both already
exist, generic/shared — this screen must use them, not reinvent turn-start
sound logic).

## Props (design this interface following Phase10Table's/RummyTable's
exact prop-naming conventions — publicState/hand/localPlayerId/names/etc.
— read theirs and match the naming style, don't invent a different
convention). Must include at minimum:

- `publicState: UnoPublicState`, `hand: UnoCard[]` (the local player's
  private hand), `localPlayerId: string`
- `names: Record<string, string>`, `colors: Record<string, string>` (per-
  seat display name/color, same shape Checkers/Chess/MT use for N seats —
  confirm the exact shape by reading one of those, they're not all
  identical, pick whichever matches N-player needs)
- `connection: 'connected' | 'disconnected'`
- `onPlayCard: (cardId: string) => void`
- `onChooseColor: (color: UnoColor) => void`
- `onDraw: () => void`
- `onPass: () => void`
- `onCallUno: (targetPlayerId: string) => void`
- `onStartNextRound: () => void` (this screen renders the "round over"
  state and a button to continue — it does NOT auto-advance on a timer;
  that pacing belongs to the wiring layer, spec 34f, same separation of
  concerns as every sibling Table component)
- `onOpenRules: () => void`, `onLeave: () => void`

## Layout (locked, per `Design Handoff/UNO.md`)

Table panel left (`flex: 1 1 620px`), scoreboard + turn log right column
(`flex: 1 1 230px`, `max-width: 330px`) — this is a direct fix the
handoff notes came from an earlier draft that put the scoreboard in a row
above the table and lost width for the card area; do not regress to that.
Brand color `#e11d2e`.

## Opponent rail (N-player — the part with no 2-player precedent)

Loop over every seat in `publicState.seatOrder` EXCEPT `localPlayerId`,
mirroring the `MexicanTrainTable`/`WahooTable` seat-rail pattern (read
theirs for the exact loop/highlight-current-seat mechanics — highlight
whichever seat is `currentPlayer(publicState.turn)`). For each opponent
seat render:
- Name + color (from `names`/`colors`).
- Their hand as a small stack of `UnoCardBack` (`size="small"`) — render
  `publicState.handCounts[seatId]` of them overlapping (a tight stack, not
  a wide fan — this is a hidden-count display, not a playable hand; a
  small negative-margin stack similar to Rummy/Phase10's opponent-hand
  convention is fine, check theirs for the exact overlap amount and reuse
  it) plus a numeric count label.
- **The Uno-call/catch button** — see its own section below, positioned
  at the far right of this opponent's row.

## Deck + discard

Side by side (or however Phase10's stock+discard pairing is laid out —
mirror that spacing/sizing). Deck: `UnoCardBack size="stock"`, `onClick`
wired to `onDraw` ONLY when it's legal to draw right now (current player
is `localPlayerId`, `publicState.pendingWild === null`,
`!publicState.hasDrawnThisTurn`, and the local hand has NO card that
`isUnoPlayable` against the current top/activeColor — import
`isUnoPlayable`/`handHasLegalPlay` from `../card-games/uno/state.ts` for
this client-side legality prediction; this is UI affordance only, the
host is still the real authority and will reject an illegally-timed
draw regardless). Show `publicState.stockCount` as a caption. Discard:
`UnoCardFace size="discard"` for the top card
(`publicState.discardPile.cards` — take the LAST element as the top,
matching the `Zone` convention every other game in this codebase uses —
confirm via `topCard()` from `card-engine/zones.ts` if you want to reuse
that helper instead of indexing manually, either is fine as long as it's
correct).

## Wild color picker

When `publicState.pendingWild !== null` AND `currentPlayer(publicState.turn) === localPlayerId`:
render four color swatches (red/yellow/green/blue, using the SAME real
brand hex values already locked in `UnoCard.css` — `#e11d2e`/`#eab308`/
`#16a34a`/`#2f6fed`, do not invent different ones here) each calling
`onChooseColor(color)`. This is the only time this screen shows a color
picker — it does not appear for anyone else, and does not appear when
`pendingWild` is set but it's NOT your turn (a non-current player just
sees a "choosing a color…" status message instead, mirroring how Phase10
Table's screen shows opponent status text for things only the current
player can act on — read that file for the exact convention).

## Your hand

Fanned `UnoCardFace` elements (`size="hand"`), `margin-left: -30px` per
card after the first with ascending `z-index` in THIS file's CSS —
exactly the Rummy/Phase10 hand-fan convention (confirm the precise pixel
value and z-index scheme by reading one of their CSS files directly, this
spec's earlier reference to `-30px` is the value already used elsewhere
in this codebase, not a new invention). Each card's `onClick` is wired to
`() => onPlayCard(card.id)` ONLY when: `pendingWild === null`,
`currentPlayer(turn) === localPlayerId`, and `isUnoPlayable(card, top,
activeColor)` — else `onClick` is omitted entirely (per spec 34d, no
opacity/ring styling differs, only whether onClick exists). If
`publicState.hasDrawnThisTurn` is true, and the current player has NOT
yet acted further this turn (i.e. they may still `PLAY_CARD` the drawn
card or `PASS`), render a "Pass" button — mirror however Phase10Table
handles its equivalent "you may act or stand pat" affordance.

## House-rules-driven hint text

When `publicState.houseRules.drawUntilPlayable` is true, the "click the
deck" hint/caption text should say something to that effect (e.g. "Draw
until you can play" vs. the standard "Draw a card") — this is the ONLY
place in this screen that reads `houseRules` at all; do not add any other
house-rule-conditional UI here (there's only the one rule, and its only
UI-visible effect is this hint text plus the natural multi-card draw
animation/count already reflected via `lastAction.drewCount`).

## The Uno-call button — read this section carefully, it was corrected
once already by the user during design and the exact behavior matters

**Visual**: uncolored, unobtrusive. No brand color, no glow/ring, no size
change on activation. Positioned at the far right of each hand row
(yours AND every opponent's, same button component reused for both —
build ONE small local component in this file, e.g. `UnoCallButton`, not
duplicated JSX). Default/off state = grayed out (`var(--disabled-text)`
color, muted background — check `components.css`'s existing disabled
button conventions and reuse them, don't invent new gray values). Active/
on state = a subtle shift toward white/full-opacity — that is the ONLY
visual change. Do NOT reuse the sort-toggle's dark-pill-becomes-white
style (`.rummy-sort-btn--active`/`.p10-sort-btn--active` from earlier
charters) — that's a much louder state change than wanted here. Build
this as its own small, deliberately quiet CSS pattern in `UnoTable.css`.

**Enable logic (client-side only, host does not enforce timing — see
spec 34b, `CALL_UNO` only checks "is there an open window for this
target", nothing time-based)**: for the seat whose button this is
(`seatPlayerId`):
- If `publicState.unoWindow === null` or `publicState.unoWindow.playerId !== seatPlayerId`:
  the button is always disabled/gray, full stop — there's nothing to call.
- If `publicState.unoWindow.playerId === seatPlayerId` (this IS the
  currently-vulnerable seat):
  - If `seatPlayerId === localPlayerId` (it's MY OWN button, a self-call):
    enabled IMMEDIATELY the instant the window appears — no delay.
  - Else (it's a CATCH button aimed at someone else): enabled only after
    1000ms have elapsed since the LOCAL client first observed this
    specific window open. Implement via a small local hook in this file
    (not a shared hook — this is genuinely Uno-specific UI timing, don't
    promote it anywhere): something like
    ```ts
    function useCatchStagger(unoWindow: { playerId: string } | null, localPlayerId: string): boolean {
      const [staggerElapsed, setStaggerElapsed] = useState(false)
      useEffect(() => {
        setStaggerElapsed(false)
        if (unoWindow === null || unoWindow.playerId === localPlayerId) return
        const t = setTimeout(() => setStaggerElapsed(true), 1000)
        return () => clearTimeout(t)
      }, [unoWindow?.playerId, localPlayerId])
      return staggerElapsed
    }
    ```
    (adjust exact shape as needed, but the effect MUST re-key off
    `unoWindow?.playerId` changing — including changing from one non-null
    value to a DIFFERENT non-null value, which per spec 34b can happen
    directly, e.g. player A's window closes uncalled and player B's turn
    immediately ends at 1 card too — the timer must restart, not
    incorrectly stay "already elapsed" from a stale previous window).
    Call this ONCE at the top of the table component (not once per seat)
    and use its boolean result when computing each non-owning seat's
    button `disabled` state.
- Clicking an enabled button calls `onCallUno(seatPlayerId)` — for your
  own row this is a self-call, for an opponent's row it's a catch. Same
  callback, different `targetPlayerId` argument, per spec 34b's action
  shape.

## Sound + turn-start

Use `useSound()` (existing hook) for `enabled`/`setEnabled`/
`turnSoundEnabled`/`setTurnSoundEnabled`/`play`/`playTurnStart`. Compute
`isMyTurn = currentPlayer(publicState.turn) === localPlayerId` and
`humanCount` the same way every other multi-seat game in this codebase
does (grep `WahooTable.tsx`'s `humanCount` computation — `playerOrder.filter(id => !id.startsWith('bot')).length`
— and reuse that exact pattern, Uno's bot ids will follow the same
`bot`/`bot-N` convention per this project's established App.tsx wiring
style, confirmed in spec 34f). Call `useTurnStartSound(isMyTurn,
humanCount, playTurnStart)`. Render `TurnSoundToggle` and `SoundToggle`
in the header, same pair every other game already has. Play existing
registry sounds (`card-play` on a successful play, `card-draw` on a
draw regardless of how many cards the house rule caused, `shuffle` on
`START_NEXT_ROUND`'s fresh deal, `round-win`/`game-win` on round/match
end) via the same "diff state, only for my own actions" pattern every
sibling Table screen already uses (`soundSigRef`-style — read Rummy or
Phase10's exact implementation and mirror it, don't invent a different
sound-triggering mechanism).

## Verify before reporting

`npx tsc -b --noEmit` silent. `npm run build` clean. No tests required
(this is a presentational screen component — confirm no sibling Table
screen has a dedicated test file either, matching spec 34d's precedent
for `UnoCard`, and report that confirmation). Report files changed,
verbatim tsc/build output, and any ambiguity you resolved with a note on
what you chose and why — especially anything in the "read theirs and
match the convention" instructions above where the sibling files
disagreed with each other and you had to pick one.
