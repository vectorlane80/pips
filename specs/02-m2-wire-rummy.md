# Spec 02 — M2: wire `DealIntro` into `RummyTable.tsx`

Read `CLAUDE.md` first — binding. This spec assumes M1
(`src/components/DealIntro.tsx`) already exists — read it in full first
to get its real exported prop names/types (they're authoritative over
anything paraphrased here). Read `src/screens/RummyTable.tsx` in full
before editing.

## Files you own
```
src/screens/RummyTable.tsx
```
Do not touch `DealIntro.tsx`, `RummyTable.css`, or any other file. Do not
run `git commit`.

## The fresh-round detection

Add a ref tracking the last round number this component has already shown
the intro for:
```ts
const introShownForRoundRef = useRef<number | null>(null)
const [showIntro, setShowIntro] = useState(false)
```
In a `useEffect` keyed on `publicState.roundNumber`:
```ts
useEffect(() => {
  if (introShownForRoundRef.current !== publicState.roundNumber) {
    introShownForRoundRef.current = publicState.roundNumber
    setShowIntro(true)
  }
}, [publicState.roundNumber])
```
This fires exactly once per distinct `roundNumber` value this component
instance ever sees — covering both the very first mount (whatever
`roundNumber` starts at, currently `1`) and every subsequent
`START_NEXT_ROUND` transition, and never re-firing for the same round on
an unrelated re-render (e.g. every card draw, which doesn't change
`roundNumber`).

## Rendering the intro

Where the component currently renders:
```tsx
{/* Main table card */}
<div className="rummy-table-card">
  {/* ...their side / centre / your side... */}
</div>
```
Change to:
```tsx
{/* Main table card */}
<div className="rummy-table-card">
  {showIntro ? (
    <DealIntro
      opponentName={opponentName}
      opponentColor={opponentColor}
      yourHandSize={hand.length}
      opponentHandSize={opponentHandCount}
      renderCardBack={(p) => <CardBack {...p} />}
      onComplete={() => setShowIntro(false)}
    />
  ) : (
    <>
      {/* ...their side / centre / your side, EXACTLY as they already are — do
         not modify any of this JSX, just wrap the existing content in this
         fragment... */}
    </>
  )}
</div>
```
Import `DealIntro` from `../components/DealIntro`. `CardBack` is already
imported in this file (confirm the exact import statement already present
before assuming — read the file's import block).

**Important — do not change `hand.length`/`opponentHandCount`'s
meaning.** `yourHandSize`/`opponentHandSize` should reflect the CURRENT
prop values at the moment the intro is showing — during a fresh deal,
`hand` (the real prop, already fully dealt by the time this component
renders — dealing is instant and host-authoritative, this is a cosmetic
replay per `CHARTER.md`) will already be the full 10-card hand and
`opponentHandCount` will already be 10; the intro animates AS IF dealing
them out, using the already-known final counts, not a live-in-progress
deal.

## Verification (run yourself before reporting)

```
npx tsc -b --noEmit
npm test
npm run build
```
All clean — no new tests required (the detection logic is a small,
directly-inspectable `useEffect`; `DealIntro` itself was already unit-
tested for its pure logic in M1). Report: exact diff description, command
output, confirm you touched only `RummyTable.tsx`, confirm no `git
commit` was run.

Do NOT attempt a browser check yourself — the lead will do that in this
milestone's verification pass. Just get the wiring correct and passing
`tsc`/`test`/`build`.
