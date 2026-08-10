# Spec 18c: Wahoo screens (M3 part 1 — new files only)

Create:
- `src/screens/WahooRoom.tsx`
- `src/screens/WahooRulesOverlay.tsx`
- `src/screens/WahooResults.tsx`
- `src/screens/WahooTable.tsx`
- `src/screens/WahooTable.css`

Study (read only): `src/screens/DominoesRoom.tsx`/`DominoesTable.tsx`
(idioms), `src/board-games/wahoo/{board,state,rules,bot}.ts`. Brand
`#9333ea`. Arm colors FIXED: red `#ef4444`, blue `#3b82f6`, green
`#22c55e`, yellow `#eab308`; muted arm `#c9c9e0`. No ScoreHeader
anywhere (user order). Must typecheck standalone (App wiring is 18d).
No sound-registry changes: reuse existing names (`dice-roll` on rolls,
`piece-drop` on moves/outs/exits, `farkle-bust` on bumps and busts,
`game-win` in results).

## WahooRoom.tsx — the first multi-seat room

```ts
export interface WahooRoomProps {
  code: string
  localName: string
  isHost: boolean
  seats: { name: string; isBot: boolean; isHost: boolean }[]  // host first, join order
  notice?: string | null
  onAddHouseBot: () => void      // host-only
  onStartGame: () => void        // host-only
  onLeave: () => void
}
```

Layout like DominoesRoom (code card + copy link) but the seat panel
lists up to FOUR seats: filled seats show name + "Host"/"House bot"
badges; empty slots show "Open seat". Host controls: "Add house bot"
(disabled at 4 seats) and a primary **Start game** button (enabled at
2–4 seats, host only). Guests see the same roster with
"Waiting for <hostName> to start…" instead of buttons. Subtitle
"Wahoo table". Colors are NOT shown in the room (assigned at start).

## WahooRulesOverlay.tsx

Title "Wahoo — how to play". Bullets (verbatim):
- "Four marbles each. Roll a 1 or 6 to bring one out; move the exact count you roll."
- "Land on an opponent and they go back to base. You can never land on your own marble."
- "Roll a 6, roll again — but three 6s in a row sends the marble you just moved home."
- "The center is a shortcut: land on it exactly (one step past a corner on your way around) and leave on a 1 or 6, coming out at the diagonally opposite corner."
- "Get all four marbles up your home lane to win. Exact counts, no jumping your own."

## WahooResults.tsx

Mirror DominoesResults (render on stage 'over' + winnerId, game-win once
on mount, rematch host-only, back to shelf). Rows: every seated player,
their arm color chip, marbles-home count (positions ≥ 52), winner
headlined ("You take it!" / "<name> takes it!").

## WahooTable.tsx + WahooTable.css

```ts
export interface WahooTableProps {
  code: string
  localPlayerId: string
  localName: string
  names: Record<string, string>        // playerId -> display name
  connection: 'connected' | 'disconnected'
  notice?: string | null
  publicState: WahooPublicState
  onRoll: () => void
  onMove: (move: WahooMove) => void
  onOpenRules: () => void
  onLeave: () => void
}
```

Header: Wordmark small + "Wahoo" label + Rules / SoundToggle / Leave
(no score pills). Below: the action strip — big die face (dots, like
the Farkle die styling if reusable, else a simple 3×3 pip square),
**Roll** button (enabled when it's your turn and phase 'roll'), and a
status line derived from `lastEvent` + turn (e.g. "You rolled a 6 —
move a marble.", "<name> bumped <name>!", "Three sixes — <name>'s
marble goes home!", "<name> has no move — passes.").

Board: square pane (max 660px, centered), rendered from
`createBoard()` at a computed unit (pane/16). Draw: all 52 track holes
(neutral), each arm's home lane holes and base holes tinted in that
arm's color at 25% (full color ring when occupied), corner holes with a
subtle diamond outline, center hole larger with the brand ring. Marbles:
filled circles in seat color with ink border + hard shadow, positioned
by translating relative positions through `trackIndexFor`/homes/bases/
center; CSS transition on transform for movement. Muted arm (3P): its
lane/base holes greyed.

Interaction (destination-click, dominoes-target style): when it's your
turn and phase 'move', compute `legalMoves(publicState, localPlayerId,
die)`; for each, compute its DESTINATION hole (out → entry hole;
advance → track/lane hole; shortcut → center; exit → diagonal corner)
and render a pulsing ring there; clicking it calls `onMove(move)`. If
two legal moves share a destination (impossible by construction — each
destination is unique per (kind, marbleIdx) since marbles occupy
distinct holes; if you find a counterexample STOP and report). Also
ring the marbles that have ≥1 legal move (subtle) so the player can see
what's movable.

Legend row below the board: one chip per seat — color dot, name, "N
home · M base", turn indicator on the current player. Sounds via the
lastEvent/revision diff pattern (dominoes idiom): roll → dice-roll;
move/out/exit/shortcut → piece-drop; any bumpedId non-null AND bust →
farkle-bust.

## Verify

```
npx tsc -b --noEmit
npm test        # 662 green
npm run build
```

## Forbidden

Modifying ANY existing file (including useSound). App wiring. git.

## Report

(1) commands + tallies; (2) files; (3) deviations or "no deviations".
