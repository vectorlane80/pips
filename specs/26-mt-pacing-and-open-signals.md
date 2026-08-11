# Spec 26 — MT: bot-turn pause + unmissable open-train signals

User feedback driving this: (a) when several bots get stuck in a row the
train horns pile into an annoying rush; (b) the red/green signal dots are
too small to notice, and with sound muted you can miss that a train opened
at all — the engine should visibly move, like standing the marker up in
the physical game.

You own edits to EXACTLY:

- `src/App.tsx` (bot pacing only)
- `src/screens/MexicanTrainTable.tsx`
- `src/screens/MexicanTrainTable.css`

## 1. Pause after a pass in the bot cadence (App.tsx)

In the MT bot loop (`runMTBots`), after an accepted action whose resulting
`publicState.lastAction.kind === 'pass-open'`, wait an ADDITIONAL
`BASE_MS * 0.8` before the loop's next iteration (on top of the existing
per-action `wait(BASE_MS)`), so consecutive stuck bots honk with clear
air between them. Same addition in the auto-PASS effect: its delay becomes
`BASE_MS * 1.6` when the PREVIOUS lastAction was also a 'pass-open'
(chained stuck players), else stays BASE_MS. No other pacing changes.

## 2. The engine visibly rolls forward when a train opens (Table + CSS)

Wrap each lane's loco in a positioned span (e.g. `.mt-loco-dock`) so the
loco can move without reflowing the label row. When that lane is open
(same `open` flag the signal uses; the Mexican train counts as always
open but does NOT animate — it has no closed state):

- `.mt-loco-dock--open .mt-loco` gets `transform: translateX(14px)`,
  `transition: transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)` (a small
  overshoot bounce — the engine "rolls out" onto the line). Closing (the
  owner plays on it) transitions back the same way.
- While open, add a gentle idle motion so the eye catches it even after
  the slide: `animation: mt-chug 1.6s ease-in-out infinite` where
  `mt-chug` bobs `translateY` between 0 and -1.5px ON TOP of the 14px
  translateX (compose both transforms in the keyframes; do not clobber
  the X offset). Subtle — a bob, not a wobble.

## 3. Bigger signals (Table + CSS)

- Signal disc: 12px → **20px**, with a `2.5px solid var(--ink)` border and
  the existing hard mini-shadow so it reads at a glance; mast grows to
  match (~26px tall, 2.5px wide). Keep the whole signal shorter than the
  loco so it doesn't overpower it.
- Keep colors: coral closed, green open, 0.2s transition, Mexican train
  always green.

## 4. Nit from review (CSS)

The `.mt-rail` comment block still says "four seat cards" — reword to
"one seat card per seat".

## Verify

`npx tsc -b --noEmit` silent; `npm test` (778) green; `npm run build` ok.
Report verbatim outputs + a one-line summary per numbered item.
