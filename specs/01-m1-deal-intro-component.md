# Spec 01 — M1: shared `DealIntro` component

Read `CLAUDE.md` at the repo root first — binding. Read
`Design Handoff/DEAL-INTRO.md` in full (the design source — quoted from
extensively below, but read it yourself too) and skim
`Design Handoff/Deal Intro Concepts.dc.html`'s JS (search for `playShuffle`,
`shuffleStep`, `cubic-bezier`) for the exact timing this spec locks in.
Read `src/hooks/useSound.ts` (already has a `'shuffle'` sound wired, use it
directly, do not add a new sound) and `src/components/PlayingCard.tsx`'s
`CardBack`/`CardBackProps` (the shape you're building a generic version
of a prop for).

## Files you own
```
src/components/DealIntro.tsx
src/components/DealIntro.test.ts
```
Do not touch any other file. Do not run `git commit`. Do not add any new
npm dependency — everything here is plain React + CSS + the browser's
`getBoundingClientRect`/`setTimeout`, all already available.

## Part 1 — pure helper: `computeDealFlights`

```ts
export interface DealFlight {
  seat: 'you' | 'opponent'
  seatIndex: number   // 0-based index of this flight WITHIN that seat's flights (0, 1, 2, ...)
}

export function computeDealFlights(
  yourCount: number,
  opponentCount: number,
  maxFlights = 10,
): DealFlight[]
```
Alternates `'opponent'`, `'you'`, `'opponent'`, `'you'`, … (opponent goes
first, matching the design doc's stated 2-player order: "opponent/you/
opponent/you…"), consuming from each seat's remaining count, until either
`maxFlights` total flights have been produced OR both counts are
exhausted, whichever comes first. If one seat's count runs out before the
other's (not expected for either current caller, both always pass equal
counts, but the function must still be correct), skip it and keep
alternating from the remaining seat until that one also runs out or the
cap is hit — never produce a flight for a seat whose count is already
exhausted.

**Required test cases** (`DealIntro.test.ts`, plain `describe`/`it`, no
DOM needed — this is the one piece of pure logic in this component):
- `computeDealFlights(10, 10)` → exactly 10 flights, alternating starting
  with `'opponent'`: `[opponent,you,opponent,you,opponent,you,opponent,you,opponent,you]`,
  each seat's `seatIndex` sequence is `0,1,2,3,4` in order.
- `computeDealFlights(10, 10, 4)` → exactly 4 flights (a smaller cap),
  still `[opponent,you,opponent,you]`.
- `computeDealFlights(3, 5)` → 8 total real cards, cap 10 → all 8 flights
  produced (`opponent,you,opponent,you,opponent,you,opponent` — wait,
  work this out correctly: with unequal counts, once the smaller count
  (3, `'you'`) is exhausted, continue producing `'opponent'`-only flights
  for the remainder — assert the exact full sequence you compute, and
  assert no `'you'` flight appears with `seatIndex >= 3`).
- `computeDealFlights(0, 5)` → 5 flights, all `'opponent'`, `seatIndex`
  `0..4`.
- `computeDealFlights(0, 0)` → empty array, no crash.

## Part 2 — the `DealIntro` component

```ts
export interface DealIntroCardBackProps {
  size: 'fan' | 'stock'
  style?: React.CSSProperties
  className?: string
}

export interface DealIntroProps {
  opponentName: string
  opponentColor: string
  yourHandSize: number
  opponentHandSize: number
  renderCardBack: (props: DealIntroCardBackProps) => React.ReactNode
  onComplete: () => void
}

export function DealIntro(props: DealIntroProps): JSX.Element
```
`renderCardBack` is how the caller injects its own game's real card-back
art (Rummy's `CardBack` or Phase 10's `Phase10CardBack` — both already
share this exact `{size:'fan'|'stock', style?, className?}` prop shape,
confirm this yourself by reading both components before assuming it) —
this component never imports either directly, keeping it game-agnostic.

### Layout (self-contained, NOT aligned to either game's real final table)

A simple, centered, three-row flex column, independent of whatever the
calling screen's real layout looks like (the design prototype itself
demos this as a self-contained sequence, not overlaid on the real table):
```
┌─────────────────────────────┐
│   [opponent pile / count]    │   <- top row: opponentName label + a small pile
│                               │      of face-down cards (starts empty)
│         [status text]         │
│         [stock: renderCardBack│   <- middle row: the stock, size="stock"
│          size="stock"]        │
│                               │
│   [your pile / count]        │   <- bottom row: "You" label + your own pile
└─────────────────────────────┘      of face-down cards (starts empty, stays
                                      face-down through the whole sequence —
                                      per the design, your own dealt cards are
                                      NOT revealed face-up during this component;
                                      that only happens once the real table
                                      settles in and shows your real hand)
```
Give the outer container a class `deal-intro` and a **new, small CSS file
is NOT needed** — use inline styles or a `<style>` block scoped to this
component (check how other components in this codebase historically
handle one-off styles not worth a separate `.css` file — if none do,
default to a small inline-style object per element, consistent with this
codebase's general convention of `.css` files per screen/component; if
you judge a `DealIntro.css` file is genuinely cleaner, that's fine too —
your call, just keep it self-contained to this component and note the
choice in your report).

### Phase state machine

Internal state: `phase: 'empty' | 'shuffle' | 'deal' | 'settled'`,
`flightIndex: number` (how many flights have started so far),
`flyState: 'idle' | 'atStock' | 'atSeat'` (drives the single reusable
flying-card element described below).

**On mount:**
1. `phase = 'empty'` initially (renders the stock only, empty piles,
   whatever status text you choose for this instant — it's brief, the
   design doc's own "tap Replay" status line is demo-only, not needed in
   production).
2. After a short delay (use `60`ms, matching the design prototype's own
   initial timer before the first shuffle tick), transition to
   `phase = 'shuffle'`. **Call `play('shuffle')` (from `useSound()`,
   imported and called inside this component) exactly once, at the
   moment `phase` becomes `'shuffle'`** — not per riffle tick, per the
   design doc's explicit "plays once, at the start of the shuffle beat —
   not once per split."
3. During `'shuffle'`, run 3 riffle-split visual ticks, `170`ms apart
   (a riffle-split tick can be as simple as a brief CSS transform/opacity
   pulse on the stock element — the design prototype's exact riffle
   visual isn't critical to replicate pixel-for-pixel, the TIMING is what
   matters: 3 ticks, 170ms apart, status text reads something like
   "Shuffling the deck…" throughout). Total shuffle phase duration:
   `3 * 170 = 510`ms.
4. After the shuffle ticks finish, transition to `phase = 'deal'`, status
   text reads something like "Dealing…".
5. Compute `flights = computeDealFlights(yourHandSize, opponentHandSize)`
   once (memoize it, e.g. `useMemo` on the two size props — they don't
   change during one intro's lifetime). For each flight in order, `130`ms
   apart: move the single reusable flying-card element to the stock's
   measured position with `transition: none` (instant snap), then on the
   next animation frame (`requestAnimationFrame`, so the browser commits
   the snap before starting the transition — otherwise the transition
   would animate FROM the previous position, not from the stock), set
   `transition: transform 0.26s cubic-bezier(0.25, 0.8, 0.35, 1)` and move
   it to that flight's target seat position (opponent pile's or your
   pile's measured position, via `getBoundingClientRect` on refs to each
   pile element — compute the delta as a CSS `transform: translate(dx,
   dy)` relative to the flying element's own resting/stock position, this
   is the standard technique for animating between two arbitrary DOM
   positions without hardcoded pixel values). Each time a flight completes
   its snap-to-target, increment that seat's visible pile-card count by 1
   (so the opponent/your pile visibly grows one card-back at a time) and
   advance `flightIndex`.
6. After the last flight's `130`ms step has fired (not necessarily
   waited for its full `0.26s` transition to visually finish — the next
   flight already started by then per the overlapping-cascade timing,
   except the very last one, where you should wait for its transition to
   actually complete, roughly `260`ms after its snap, before moving on),
   transition to `phase = 'settled'` and call `props.onComplete()`
   exactly once.

**Cleanup:** clear all pending timers on unmount (a `useEffect` return
function) — this component may unmount before its sequence finishes if,
e.g., the underlying game state changes unexpectedly; don't call
`onComplete` or continue timers after unmount.

### The single reusable flying-card element

Per the design doc: "a single reusable element per demo (not one per
card)." Render exactly one `renderCardBack({size:'stock', style:{
position:'absolute', transform: ... }})` element for the "currently
flying" card, positioned absolutely within a `position: relative` wrapper
around the whole three-row layout, hidden (`opacity: 0` or `display:
none`) during `'empty'` and `'shuffle'` phases, visible only during
`'deal'`.

## Verification (run yourself before reporting)

```
npx tsc -b --noEmit
npm test
npm run build
```
All clean. `npm test` must include the new `computeDealFlights` test
cases passing; no DOM-rendering test is required or possible without a
new dependency this charter forbids (see `CHARTER.md` Non-goals) — the
component's actual rendered/animated behavior will be verified live in a
browser by the lead in a later milestone, not by you.

Report: files created, the exact timing constants you used (confirm they
match the numbers in this spec — 60ms initial, 3×170ms shuffle,
130ms-per-flight deal, 0.26s cubic-bezier(.25,.8,.35,1) transition), your
CSS-file-vs-inline-styles judgment call and why, exact command output,
confirm no new dependency was added and no `git commit` was run.
