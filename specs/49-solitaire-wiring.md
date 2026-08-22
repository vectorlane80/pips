# Spec 49 — Solitaire wiring (shelf tile, route, App state)

Builds on specs 47 (engine) and 48 (screens), both landed. Read
`CLAUDE.md` first. Read `src/App.tsx`'s Skip-Bo sections in full as the
pattern (search `skipBo`): state declarations, `resetToEntry`'s Skip-Bo
block, `hostGameFromBoot`, `liveGameNow`, the `liveGameRef` effect deps,
`startSkipBoHost`, and the "Skip-Bo session active" render block. Then
read `src/state/route.ts`, `src/state/route.test.ts`, and
`src/screens/Landing.tsx`.

You own EXACTLY these existing files (edit only):
- `src/App.tsx`
- `src/screens/Landing.tsx`
- `src/state/route.ts`
- `src/state/route.test.ts`

Do NOT touch any other file. Do NOT run git. No new dependencies.

## Design decisions (locked)

Solitaire is single-player and local: **no PeerJS host, no code, no
guests, no bots, no broadcast**. It still gets a lobby (SolitaireRoom), a
URL, the popstate guard, and the same reset discipline as every other
game.

### `route.ts` / `route.test.ts`
- Add `'solitaire'` to `RoutedGame` and `GAME_SEGMENTS` (`solitaire:
  'solitaire'`), placed after `skipbo`.
- Add one test alongside the existing per-game `gameFromPath` cases:
  `expect(gameFromPath('/pips/solitaire')).toBe('solitaire')`. If any
  existing test enumerates every segment (e.g. counts `GAME_SEGMENTS`
  keys), update that expectation.

### `Landing.tsx`
- New prop `onPickSolitaire: () => void` (add to the props interface and
  the destructuring, after `onPickSkipBo`).
- New shelf entry, LAST in `SHELF`: `{ title: 'Solitaire', note: '1 player',
  color: '#4d7c0f', onClick: onPickSolitaire }`.

### `App.tsx`

Imports (with the other game imports):
```ts
import { createSolitaireGame, type SolitaireState, type SolitaireMode, type SolitaireMove } from './card-games/solitaire/state'
import { applyMove as applySolitaireMove } from './card-games/solitaire/shared'
import { SolitaireRoom } from './screens/SolitaireRoom'
import { SolitaireTable } from './screens/SolitaireTable'
import { SolitaireResults } from './screens/SolitaireResults'
```

State (in the "---- Solitaire ----" block after Skip-Bo's state):
```ts
const [solitaireOpen, setSolitaireOpen] = useState(false)          // lobby or table is showing
const [solitaireMode, setSolitaireMode] = useState<SolitaireMode>('klondike')
const [solitaireHistory, setSolitaireHistory] = useState<SolitaireState[]>([])  // [0] = current deal start … last = current
const [solitaireDealId, setSolitaireDealId] = useState(0)
```
No refs are needed — there are no async actors. `rummyCardBack` /
`rummyCardBackRef` / `rummySetCardBack` already hold the cookie-backed
card back; **reuse them** for Solitaire (the charter says the choice is
shared between games). Do not add a second card-back state.

Helpers (in a "---- Solitaire helpers ----" block):
```ts
function startSolitaire() {
  writeNameCookie(name)
  pushGameUrl('solitaire')
  setError(null)
  setSolitaireHistory([])
  setSolitaireOpen(true)
}
function solitaireDeal() {
  const seed = Math.floor(Math.random() * 2147483647)
  setSolitaireHistory([createSolitaireGame(solitaireMode, seed)])
  setSolitaireDealId((n) => n + 1)
}
function solitaireApply(move: SolitaireMove) {
  setSolitaireHistory((h) => {
    const current = h[h.length - 1]
    const outcome = applySolitaireMove(current, move)
    return outcome.ok ? [...h, outcome.state] : h
  })
}
function solitaireUndo() {
  setSolitaireHistory((h) => (h.length > 1 ? h.slice(0, -1) : h))
}
```
`solitaireSetCardBack` is just `rummySetCardBack` — but that function
early-returns unless `rummyRole === 'host'`. Factor the cookie write +
state/ref update into a small shared `setCardBackPreference(id)` used by
both: `rummySetCardBack` keeps its role/started guard and broadcast and
calls `setCardBackPreference`; Solitaire's lobby calls
`setCardBackPreference` directly.

`resetToEntry` — add a Solitaire block after Skip-Bo's:
```ts
// Solitaire
setSolitaireOpen(false)
setSolitaireHistory([])
```
(`solitaireMode` and the card back are preferences and survive a reset.)

`hostGameFromBoot`: `case 'solitaire': startSolitaire(); return`.

`liveGameNow`: before the final `return null`:
```ts
if (solitaireOpen && solitaireHistory.length > 0 && !solitaireHistory[solitaireHistory.length - 1].won) return 'solitaire'
```
and add `solitaireOpen, solitaireHistory` to the `liveGameRef` effect's
dependency array.

Landing: pass `onPickSolitaire={startSolitaire}`. The landing guard `if
(!room && !rummyRole && …)` must also require `!solitaireOpen`.

Render block ("---- Solitaire session active ----", placed after the
Skip-Bo block, before the fallback `return null`):
```tsx
if (solitaireOpen && solitaireHistory.length === 0) {
  return (
    <SolitaireRoom
      localName={name}
      cardBack={rummyCardBack}
      onSelectCardBack={setCardBackPreference}
      mode={solitaireMode}
      onSelectMode={setSolitaireMode}
      onStart={solitaireDeal}
      onLeave={resetToEntry}
    />
  )
}
if (solitaireOpen) {
  const current = solitaireHistory[solitaireHistory.length - 1]
  if (current.won) {
    return (
      <SolitaireResults
        mode={current.mode}
        moves={current.moves}
        onDealAgain={solitaireDeal}
        onBackToShelf={resetToEntry}
      />
    )
  }
  return (
    <SolitaireTable
      localName={name}
      state={current}
      cardBack={rummyCardBack}
      dealId={solitaireDealId}
      canUndo={solitaireHistory.length > 1}
      onMove={solitaireApply}
      onUndo={solitaireUndo}
      onDealAgain={solitaireDeal}
      onLeave={resetToEntry}
    />
  )
}
```
"Deal again" from the table re-deals in the SAME mode immediately (no
trip back through the lobby); changing mode means Leave → shelf → Solitaire.

## Required tests
- The `route.test.ts` case above.
- Nothing else is unit-testable here; the suite must stay green.

## Verify before reporting
Run: `npx tsc -b --noEmit` (silent), `npm test` (previous count + 1, 0
failed — report the exact line), `npm run build` ("✓ built").

## Required skills
Apply writing-lean-code and verification-before-completion.

## If stuck
After 3 failed attempts at any part, stop and report honestly.

## Report format
- Files edited
- Verbatim final `npm test` line, tsc output (or "silent"), build's final line
- Anything the spec didn't cover
