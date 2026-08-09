# Spec 10 — Connect 4 M2: table screen and app wiring

## Task
Build the Connect 4 table screen and wire the game into the app shell:
routing, bot driving, round-advance pause, shelf/picker entries, and the
piece-drop sound. M1 (rules/state/types) is already in the working tree.

## Working directory
/Users/charlie/Desktop/Projects/pips

## Files you own
- `src/screens/Connect4Table.tsx` (create)
- `src/App.tsx` (modify)
- `src/screens/Landing.tsx` (modify — one line)
- `src/screens/Room.tsx` (modify — one line)
- `src/hooks/useSound.ts` (modify)

Everything else is read-only. `src/assets/sounds/piece-drop.mp3` already
exists (placed by the lead). Model the screen on `src/screens/TttTable.tsx`
and the bot/pause wiring on TTT's code in `src/App.tsx` — read both first.

## Design decisions (already made — implement exactly, do not redesign)

### `src/hooks/useSound.ts`
- `import pieceDrop from '../assets/sounds/piece-drop.mp3'` (grouped with the
  other imports, after `markPlace`).
- Add `'piece-drop'` to the `SoundName` union (after `'mark-place'`) and
  `'piece-drop': pieceDrop,` to `SOUND_FILES` (same position).

### `src/screens/Landing.tsx` and `src/screens/Room.tsx`
In each file's `const GAMES: Game[]` array, append `'connect4'` at the end.
Nothing else — both screens render generically from the `GAME_*` records.

### `src/screens/Connect4Table.tsx`
Same component shape, props, and file structure as `TttTable.tsx`:

```ts
export function Connect4Table({
  room, localSeatId, onPlay, onOpenRules, onLeave,
}: {
  room: RoomState
  localSeatId: string | null
  onPlay: (col: number) => void
  onOpenRules: () => void
  onLeave: () => void
})
```

Imports: `useEffect, useRef, useState` from react, `RoomState` type,
`lowestOpenRow` from `../games/connect4`, `TableHeader`, `useSound`.

Derived values (mirror TttTable):
- `const c = room.connect4`
- `activeSeat = room.seats[room.turnIdx]`, `isMyTurn = activeSeat?.id === localSeatId`
- `roundWinner = c.roundOver && c.winLine.length > 0 ? room.seats[c.board[c.winLine[0]]!] : null`
- `roundStatus` when roundOver: winner → `'You connect four!'` if mine else
  `` `${roundWinner.name} connects four!` ``; draw → `"It's a draw — playing again."`
- Live status line: `roundStatus ?? (isMyTurn ? 'Pick a column.' : `${activeSeat?.name} is thinking…`)`

Local hover state (NOT networked, never leaves this component):
- `const [hoverCol, setHoverCol] = useState<number | null>(null)`
- The preview cell index is
  `hoverCol !== null && isMyTurn && !c.roundOver ? (lowestOpenRow(c.board, hoverCol) >= 0 ? lowestOpenRow(c.board, hoverCol) * 7 + hoverCol : null) : null`
  (compute `lowestOpenRow` once into a variable, not twice).

Sound effect — copy TttTable's diff-signature pattern exactly, adapted:
- `discCount = c.board.filter((cell) => cell !== null).length`
- ref holds `{ roundOver, discCount, wasMyTurn }`
- on change: if `wasMyTurn && discCount > prev.discCount` → `play('piece-drop')`;
  if `!prev.roundOver && c.roundOver` → `play('round-win')`; then update ref.
- Same dependency array style as TttTable's effect.

Layout (mirror TttTable's outer structure):
- Root div: same `maxWidth: 1260` padding wrapper as TttTable.
- `<TableHeader gameLabel="Connect 4" gameColor="var(--connect4-color)" meta={`${room.code} · first to three`} onRules={onOpenRules} onLeave={onLeave} />`
- Two-column flex wrap exactly like TttTable: left `flex: '1 1 460px'`,
  right seats column `flex: '1 1 230px', maxWidth: 330`.
- Left card: `className="card card-resting"`, chip
  `<span className="chip" style={{ background: (roundWinner ?? activeSeat)?.color }}>`
  with text `roundStatus ? 'Round over' : isMyTurn ? 'Your move' : `${activeSeat?.name}'s move``,
  then the status div (same font sizing/coloring logic as TttTable's).

The board tray, below the status div:
```tsx
<div style={{ background: 'var(--page-base)', border: '4px solid var(--ink)', borderRadius: 20, padding: 'clamp(10px,1.6vw,16px)', maxWidth: 560 }}>
  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 'clamp(6px,1vw,10px)' }}>
    {c.board.map((cell, i) => { ... })}
  </div>
</div>
```

Each of the 42 cells is a `<button type="button">` (key `i`), with
`const col = i % 7`, `const owner = cell !== null ? room.seats[cell] : null`,
`const isWin = c.winLine.includes(i)`, `const isPreview = i === previewIndex`:

- `onClick={() => onPlay(col)}`
- `onMouseEnter={() => setHoverCol(col)}`, `onMouseLeave={() => setHoverCol(null)}`
- `disabled={!isMyTurn || c.roundOver || lowestOpenRow(c.board, col) < 0}`
- Style, exactly:
  - always: `aspectRatio: '1'`, `borderRadius: '50%'`, `padding: 0`,
    `transition: 'transform .15s ease'`,
    `cursor:` `'pointer'` when the button is enabled, else `'default'`.
  - empty, no preview: `background: '#fff'`,
    `border: '4px solid var(--grey-border)'`,
    `boxShadow: 'inset 0 4px 6px rgba(23,23,58,0.12)'` (the socket).
  - preview cell (empty, my hover target): same as empty but
    `background: activeSeat.color` (the local player IS activeSeat when
    previewing — isMyTurn is required) and `opacity: 0.3`.
  - filled: `background: `radial-gradient(circle at 32% 26%, rgba(255,255,255,0.55), ${owner.color} 62%)``,
    `border: '4px solid var(--ink)'`,
    `boxShadow: '0 5px 0 rgba(23,23,58,0.30), inset 0 -5px 0 rgba(23,23,58,0.22), inset 0 4px 0 rgba(255,255,255,0.30)'`.
  - filled + isWin: same gradient/border but
    `boxShadow: '0 6px 0 var(--yellow), inset 0 -5px 0 rgba(23,23,58,0.22), inset 0 4px 0 rgba(255,255,255,0.30)'`
    and `transform: 'translateY(-4px)'`.

Below the tray:
`<p style={{ fontSize: 14, color: 'var(--muted-text)', marginTop: 14, minHeight: 20 }}>` with
text: when it's my turn and not roundOver → `'Click a column to drop your disc.'`,
else empty string (keep the element for stable height).

Right column: copy TttTable's seats column verbatim, substituting
`c.wins[s.id] ?? 0` for the wins read (`first to 3` label stays).

### `src/App.tsx`
Mirror every TTT touchpoint, adding Connect 4 alongside, same style:

1. Imports: `Connect4Table` from `./screens/Connect4Table`;
   `decideConnect4Move` from `./games/connect4`.
2. `whoActsNow`: add `'connect4'` to the turnIdx-based branch:
   `if (state.screen === 'farkle' || state.screen === 'yahtzee' || state.screen === 'ttt' || state.screen === 'connect4')`.
3. New `runConnect4Bot(seatId, key)` directly after `runTttBot`, identical
   shape: wait `BASE_MS * pace`, bail if stale, compute `me`/`opponent`
   seat indices, `decideConnect4Move(state.connect4.board, me, opponent)`,
   `hostApply({ type: 'connect4Play', col }, seatId)`.
4. `runBotsIfNeeded`: add `else if (state.screen === 'connect4') await runConnect4Bot(actor.id, myKey)`.
5. Round pause: in the existing TTT round-pause `useEffect`, add a parallel
   branch (separate `useEffect` directly below TTT's, same comment style):
   when `room.screen === 'connect4' && room.connect4.roundOver`, set a
   `ROUND_PAUSE_MS` timeout dispatching `{ type: 'connect4AdvanceRound' }`,
   with cleanup, deps `[role, room?.screen, room?.connect4.roundOver]`.
6. Render: after the ttt block, add
   `{room.screen === 'connect4' && (<Connect4Table room={room} localSeatId={localSeatId} onPlay={(col) => dispatch({ type: 'connect4Play', col })} onOpenRules={() => setRulesOpen(true)} onLeave={resetToEntry} />)}`.

## Do NOT
- Touch `src/games/`, `src/state/`, `src/types.ts`, `rules.ts`,
  `Results.tsx`, `tokens.css`, any card-game/card-engine file, or any test.
- Run git, commit, or push.
- Add dependencies, new CSS classes, a disc-fall animation, difficulty
  handling, or any abstraction this spec doesn't call for.
- Do not network `hoverCol` — it stays component-local.

## Required tests
None new — this slice is DOM/UI plus App wiring; the project has no DOM test
setup and rendered behavior is browser-verified by the lead. Do not add test
files. The existing suite must stay at 480 passing.

## Verify before reporting
1. `npx tsc -b --noEmit` — clean, exit 0.
2. `npm test` — `480 passed`.
3. `npm run build` — exit 0.

## Inline rules
No abstractions, defensive code, or cleanup beyond this spec. Run all three
verification commands and report their real output.

## If stuck
After 3 failed attempts at any part, stop and report honestly what works,
what doesn't, and what you tried.

## Report format
- Files changed (list)
- The three verification commands' verbatim final lines
- Anything you noticed that the spec didn't cover
