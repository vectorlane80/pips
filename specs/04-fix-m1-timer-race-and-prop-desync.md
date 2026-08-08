# Spec 04 — fix: DealIntro backgrounded-tab race + live-prop desync

Adversarial review of `src/components/DealIntro.tsx` found one confirmed
real bug and one the lead independently confirmed is actually live (not
just dormant, as the review's own more cautious wording suggested) — fix
both. Read the current file in full first.

## Files you own
```
src/components/DealIntro.tsx
```
Do not touch `DealIntro.test.ts` or any other file. Do not run `git
commit`.

## Bug 1 — `settle()`/`onComplete` can fire while backgrounded, before the
animation has visually finished

`requestAnimationFrame` callbacks are fully suspended while a browser tab
is backgrounded, but `setTimeout` callbacks are only throttled, not
suspended. Currently, `launch()` schedules the NEXT step (either the next
`launch` via `timer(FLIGHT_INTERVAL_MS, launch)`, or `settle` via
`timer(FLIGHT_DURATION_MS, settle)`) synchronously, right after pushing
the current flight's `requestAnimationFrame` call — NOT gated on that
rAF having actually executed. If the tab is backgrounded partway through
the deal, the `setTimeout` chain can keep advancing (queuing up rAFs that
never run) and eventually fire `settle()`/`onComplete()` while the last
real paint the user saw is mid-deal — then, on foregrounding, every queued
rAF fires in a burst, producing a visible jump.

**The fix:** move the "was this the last flight? if so, schedule `settle`"
decision from the synchronous code right after `requestAnimationFrame(...)`
into the rAF callback itself — so `settle` is only ever scheduled once the
browser has actually run that frame (which cannot happen while
backgrounded, since rAF itself is suspended then; this is exactly the
correct fix, not a workaround — it makes completion depend on genuine rAF
execution instead of racing it).

Concretely, restructure `launch()` so the code currently reading:
```ts
rafsRef.current.push(
  requestAnimationFrame(() => {
    if (cancelled.current) return
    // ...position math...
    setFlyState('atSeat')
    setFlightIndex(nextIndex)
  }),
)

index = nextIndex
if (index < dealFlights.length) {
  timer(FLIGHT_INTERVAL_MS, launch)
} else {
  timer(FLIGHT_DURATION_MS, settle)
}
```
becomes (the `index < dealFlights.length` branch stays scheduling the next
`launch` synchronously as before — that part isn't the bug, since a
mid-sequence backgrounding just delays the whole chain rather than
completing early; only the FINAL step's `settle` scheduling needs to move
inside the rAF):
```ts
const isLastFlight = index + 1 >= dealFlights.length
const nextIndex = index + 1

rafsRef.current.push(
  requestAnimationFrame(() => {
    if (cancelled.current) return
    // ...same position math as before...
    setFlyState('atSeat')
    setFlightIndex(nextIndex)
    if (isLastFlight) {
      timer(FLIGHT_DURATION_MS, settle)
    }
  }),
)

index = nextIndex
if (!isLastFlight) {
  timer(FLIGHT_INTERVAL_MS, launch)
}
```
(Adjust variable naming/placement to fit the existing code's actual
structure — this is the logic, not a literal patch. The key invariant:
**`settle` must never be scheduled except from inside a `requestAnimationFrame`
callback that has actually run.**)

## Bug 2 — pile-count rendering uses a live, prop-reactive `flights` value
instead of the frozen schedule the animation is actually running

Currently:
```ts
const flights = useMemo(
  () => computeDealFlights(yourHandSize, opponentHandSize),
  [yourHandSize, opponentHandSize],
)
flightsRef.current = flights
```
This recomputes `flights` (and the rendered pile counts derived from it)
whenever `yourHandSize`/`opponentHandSize` props change — but the actual
animation sequencing inside the mount-effect captured its own one-time
snapshot (`flightsRef.current` read once when `startDeal` first runs).
**This is a live bug, not just a dormant one**: if the bot is the current
player when a fresh round deals, it can draw/discard while the ~1.9s
intro is still playing — changing `opponentHandCount` (a real prop this
component receives) mid-animation, which recomputes `flights` to a
different shape than what `dealFlights`/`flightIndex` are actually
tracking, producing wrong/inconsistent rendered pile counts during the
tail of the animation.

**The fix:** capture `flights` ONCE, at mount, and never recompute it —
matching this component's own documented contract (`CHARTER.md`: "these
props don't change during one intro's lifetime," now enforced instead of
just assumed):
```ts
const [flights] = useState(() => computeDealFlights(yourHandSize, opponentHandSize))
```
(A `useState` initializer runs exactly once, on mount, regardless of later
re-renders — this is the standard React idiom for "compute once, freeze
forever," simpler than a ref-plus-effect for this case.) Since `flights`
is now already frozen, `flightsRef` becomes redundant — remove it, and
have the mount-effect's `startDeal`/`launch` read `flights` directly (it's
now a stable value closed over by the effect, not a ref) instead of
`flightsRef.current`. The rendered `yourPileCount`/`opponentPileCount`
computation (which reads `flights` in the render body) now automatically
uses the same frozen value the animation is actually running against — no
other change needed there.

## Verification (run yourself before reporting)

```
npx tsc -b --noEmit
npm test
npm run build
```
All clean, all 469+ existing tests still passing (no test changes
required — both fixes are internal to the component's timer/state
management, not observable by the existing `computeDealFlights` unit
tests). Report: exact diff, confirm both fixes match the described
invariants (settle only scheduled from inside a real rAF callback;
`flights` captured once at mount via `useState` initializer, `flightsRef`
removed), command output, confirm no `git commit` was run.
