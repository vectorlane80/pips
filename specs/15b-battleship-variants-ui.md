# Spec 15b: Battleship rule variants — UI + wiring (M2)

Wire the three variants into the host flow and table chrome. Modify ONLY:
`src/App.tsx`, `src/screens/BattleshipRoom.tsx`,
`src/screens/BattleshipTable.tsx`, `src/screens/BattleshipTable.css`,
`src/screens/BattleshipRulesOverlay.tsx`. Write all edits, verify once at
the end.

## BattleshipRoom.tsx — variant picker (host-only screen)

New props: `variant: BattleshipVariant`, `onSetVariant: (v: BattleshipVariant) => void`.
Between the invite-code card and "Play the house", add a "House rules"
section: three stacked option buttons (`<button type="button">`), each with
a bold label and a one-line description:

- `standard` — **Standard turn-based** — "One shot each, hit or miss."
- `streak` — **Make it, take it** — "Keep firing as long as you hit."
- `free` — **Free-for-all** — "No turns — both fleets fire at will. First
  to sink five wins."

Selected option: border `#1a6fae`, light blue bg (like the tray's selected
row); others neutral. Clicking calls `onSetVariant`. Style with new
`bs-variant-*` classes in `BattleshipTable.css` (it's already the game's
stylesheet; Room may import it — check how BattleshipRoom currently gets
styles and follow suit, adding a small scoped block).

## App.tsx

- `const [battleshipVariant, setBattleshipVariant] = useState<BattleshipVariant>('standard')`
  + mirrored `battleshipVariantRef` (host callbacks close over stale
  state), kept in sync where the other battleship refs are.
- `startBattleshipHost`'s `onJoin` and `addBattleshipHouseBot`: pass
  `battleshipVariantRef.current` as the third argument to
  `createBattleshipGame`.
- `battleshipRematch`: pass `prev.session.publicState.variant` (the
  finished match's variant — NOT the picker state).
- `resetToEntry`: reset variant state (and ref) to `'standard'`.
- BattleshipRoom render: pass `variant={battleshipVariant}`
  `onSetVariant={(v) => { setBattleshipVariant(v); battleshipVariantRef.current = v }}`
  (or a small named handler — match local style).
- Bot loop gate: in `runBattleshipBotsIfNeeded` AND the re-check inside
  `runBattleshipBot`, the "bot may act" condition becomes:
  stage === 'battle' AND (variant === 'free' ? true : currentPlayer(ps.turn) === 'bot')
  — read variant from the session ref's publicState. Free mode: the bot
  fires every BASE_MS regardless of whose "turn" the vestigial pointer
  names, until stage 'over'. The existing staleness key
  (`stage:turnNumber`) already changes on every accepted shot in every
  variant (extraTurn bumps turnNumber), so the loop cadence needs no
  other change.

## BattleshipTable.tsx — per-variant chrome

Read `publicState.variant`.

- **Clickability**: enemy cells are clickable when stage is 'battle', the
  cell is unfired, and (variant === 'free' ? true : it is your turn).
- **Turn chip / title** (battle): standard + streak unchanged ("Your
  move" / "<name>'s move"); free → title "Free-for-all", chip color
  `#1a6fae` always.
- **Status line** additions:
  - streak, you hit (result 'hit', by you): "Direct hit! Fire again."
  - streak, you sank (result 'sunk', by you, match not over):
    "You sank their <Ship>! Fire again."
  - all other streak texts unchanged from standard.
  - free, no lastShot yet: "Fire at will!"
  - free, otherwise: same lastShot texts as standard (they carry no turn
    phrasing).
- **Hint line**: free → "No turns — sink all five first." (both players,
  whole battle); streak/standard unchanged ("Click enemy waters to
  fire." / "<name> is aiming…").
- Placement phase chrome: identical in all variants (no changes).

## BattleshipRulesOverlay.tsx

Add one bullet at the end: "Three ways to play — Standard (one shot
each), Make it take it (keep firing while you hit), Free-for-all (no
turns; first to sink all five wins)."

## Verify (once)

```
npx tsc -b --noEmit
npm test        # 523 green
npm run build
```

## Forbidden

Any file outside the five listed; changing the game module; new sounds;
git commands.

## Report

(1) commands + tallies; (2) changes per file; (3) deviations or "no
deviations".
