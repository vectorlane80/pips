# Spec 03 — M3: wire `DealIntro` into `Phase10Table.tsx`

Read `CLAUDE.md` first — binding. Identical shape to spec 02 (which wired
the same component into `RummyTable.tsx` — read that spec and, if the
`RummyTable.tsx` wiring is already committed, read the actual diff there
too for the proven pattern), adapted for Phase 10's prop names. Read
`src/components/DealIntro.tsx` (from M1) and `src/screens/Phase10Table.tsx`
in full before editing.

## Files you own
```
src/screens/Phase10Table.tsx
```
Do not touch `DealIntro.tsx`, `Phase10Table.css`, or any other file. Do
not run `git commit`.

## The fresh-round detection

Identical pattern to Rummy's:
```ts
const introShownForRoundRef = useRef<number | null>(null)
const [showIntro, setShowIntro] = useState(false)

useEffect(() => {
  if (introShownForRoundRef.current !== publicState.roundNumber) {
    introShownForRoundRef.current = publicState.roundNumber
    setShowIntro(true)
  }
}, [publicState.roundNumber])
```

## Rendering the intro

Where the component currently renders:
```tsx
{/* Main table card */}
<div className="p10-table-card">
  {/* ...their side / ladder / centre / your side... */}
</div>
```
Change to:
```tsx
<div className="p10-table-card">
  {showIntro ? (
    <DealIntro
      opponentName={opponentName}
      opponentColor={opponentColor}
      yourHandSize={hand.length}
      opponentHandSize={opponentHandCount}
      renderCardBack={(p) => <Phase10CardBack {...p} />}
      onComplete={() => setShowIntro(false)}
    />
  ) : (
    <>
      {/* ...their side / ladder / centre / your side, EXACTLY as they already
         are — do not modify any of this JSX, just wrap the existing content
         in this fragment... */}
    </>
  )}
</div>
```
Import `DealIntro` from `../components/DealIntro`. `Phase10CardBack` is
already imported in this file (confirm the exact existing import
statement before assuming).

Same note as spec 02: `yourHandSize`/`opponentHandSize` use the already-
fully-dealt current prop values (`hand.length`, `opponentHandCount`) —
the intro is a cosmetic replay of an already-completed deal, not a
live-in-progress one.

## Verification (run yourself before reporting)

```
npx tsc -b --noEmit
npm test
npm run build
```
All clean — no new tests required. Report: exact diff description,
command output, confirm you touched only `Phase10Table.tsx`, confirm no
`git commit` was run.

Do NOT attempt a browser check yourself — the lead will do that in this
milestone's verification pass. Just get the wiring correct and passing
`tsc`/`test`/`build`.
