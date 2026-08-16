# Spec 34h — Uno UX fixes

Live-play feedback on the shipped Uno table found several real gaps
against the established conventions in `RummyTable.tsx`/`Phase10Table.tsx`,
plus two correctness bugs. This spec fixes all of them in one pass.

You own edits to EXACTLY these files (plus creating the two new test
files listed under §9 if you judge them warranted — see that section):

- `src/screens/UnoTable.tsx`
- `src/screens/UnoTable.css`
- `src/components/UnoCard.tsx`

Do NOT touch `src/card-games/uno/*` (rules.ts, state.ts, bot.ts, deck.ts)
— every fix below is confined to the presentation layer; the host-
authoritative engine is correct and out of scope. Do NOT touch
`src/hooks/useSound.ts` — the six new Uno sound names (`uno-call`,
`uno-called-on`, `uno-skip`, `uno-reverse`, `uno-draw`, `uno-wild`) are
already wired into the registry with placeholder audio files; just
call `play(...)` with these names at the right points.

Before writing, READ in full: `src/screens/RummyTable.tsx` and
`src/screens/RummyTable.css` (select-then-confirm card interaction,
`sortHand`, the deal-intro wiring, sound-diffing pattern), the current
`src/screens/UnoTable.tsx`/`.css` and `src/components/UnoCard.tsx`, and
`src/card-games/uno/rules.ts` (read-only, to confirm exact field
shapes — `UnoRoundResult.pointsAdded`, `UnoLastAction`, etc.).

## 1. Select-then-confirm card play (was: single click plays instantly)

Rummy/Phase10 both use click-to-select (toggles a `selectedIds`/
`selectedId` state, applies a `selected` highlight) then a SEPARATE
"Play"-type button click to commit. Uno currently wires `onClick` on
a legal card straight to `onPlayCard(cardId)` — no selection step.

Fix: add local `selectedId: string | null` state. Clicking a legal
hand card (same legality gate as today — `cardClickable(card)`)
selects it (clicking the already-selected card deselects it; clicking
a different legal card replaces the selection — Uno only ever plays
one card at a time, so this is single-select, not Rummy's multi-
select). Selected card gets a `selected` visual treatment — check how
`RummyCard`/`Phase10Card` signal "selected" (a ring/border modifier
class) and give `UnoCardFace` the equivalent: add an optional
`selected?: boolean` prop that applies a comparable ring/border
modifier class in `UnoCard.css`, distinct from (and in addition to,
if a card can theoretically be both — it can't here) the existing
click/disabled-only styling.

A "Play" button appears in the actions row (where "Pass" already
lives) enabled only when `selectedId !== null`; clicking it calls
`onPlayCard(selectedId)` and clears the selection. Clear the selection
whenever it stops being valid: the turn changes, `pendingWild` opens,
the selected card leaves the hand, or the card becomes illegal for any
reason — mirror how Rummy/Phase10 clear `selectedIds` on their
equivalent invalidating transitions (grep their `useEffect`s that
reset selection).

## 2. Card sort order (was: raw deal/draw order, unsorted)

Unlike Rummy/Phase10's user-toggleable two-way sort, Uno gets ONE
fixed canonical order, always applied, no toggle button:

1. Group by color in a fixed order: red, yellow, green, blue.
2. Within each color group: number cards ascending by value (0-9)
   first, then the color's action cards (skip, reverse, draw2) after
   the numbers, in that fixed sub-order.
3. Wild and wild4 cards are NOT part of any color group — they always
   sort to the very end of the whole hand (wild before wild4, or
   either order — pick one and be consistent).

Write a pure `sortUnoHand(cards: UnoCard[]): UnoCard[]` function (co-
locate in `UnoTable.tsx`, doesn't need to be exported/shared) and
render `sortedHand` (a `useMemo` keyed on `hand`) instead of the raw
`hand` prop everywhere the hand is rendered AND wherever hand order
otherwise matters (there's no "just-drawn card pinned at the end"
exception in this spec — always fully sorted, full stop). Update
`selectedId`-related logic if needed so selection still tracks by
card id correctly against the sorted array (it will, since selection
is id-based, not index-based — just confirm no code assumes hand order
matches deal/draw order).

## 3. Deal intro (was: missing entirely — no shuffle animation ever)

Mirror Rummy's exact wiring (`RummyTable.tsx`): import `DealIntro` from
`../components/DealIntro`, add `introShownForRoundRef`/`showIntro`
state keyed on `publicState.round` (fires once per distinct round this
component instance ever sees, covering both the initial mount and
every `START_NEXT_ROUND`), and gate the entire table-card body behind
`showIntro` exactly like Rummy does — when true, render `<DealIntro
others={...} yourHandSize={hand.length} shuffleSound="shuffle"
renderCardBack={(p) => <UnoCardBack {...p} />} onComplete={() =>
setShowIntro(false)} />` instead of the normal table.

`others` is `publicState.seatOrder` minus `localPlayerId`, each seat
as `{ id, name: names[id] ?? id, color: colors[id] ?? 'var(--slate-pip)', handSize: publicState.handCounts[id] ?? 0 }`
— this is genuinely N-1 opponents (unlike Rummy's fixed single
opponent), which `DealIntro`'s `others: array` shape already supports
(it was generalized for Mexican Train). `UnoCardBack` already accepts
the `{size, style?, className?}` shape `DealIntro`'s `renderCardBack`
expects (confirm against `DealIntroCardBackProps` and `UnoCardBack`'s
actual prop types before wiring — they should already match since
`UnoCardBack` was built to the same convention as `Phase10CardBack`).

## 4. Turn highlight consistency (opponent rail vs scoreboard)

Currently the scoreboard rows get a full seat-color fill on the
current player's row (`.uno-score-row--turn`), but the opponent rail
rows only get a border-color change (`.uno-opp-row--turn`) plus a
separate "turn" tag chip — an inconsistent, weaker treatment for the
same underlying state shown in two places on the same screen. Make the
opponent rail row match the scoreboard's full-fill treatment (same
`background`/`borderColor`/`color: '#fff'` inline pattern, same
lightened sub-text/dot-border treatment in CSS) — keep the "turn" tag
chip too if it still reads well against the fill (it should, it's the
same pattern MexicanTrain/Wahoo use elsewhere), just make the base
row fill consistent between the two rails.

## 5. Footnote text (was: "Your hand never leaves this device — only the play does.")

Remove this line entirely. Check whether Rummy/Phase10 have an
equivalent footnote at all before deciding what (if anything) replaces
it — if they have none, Uno should have none either, for consistency.

## 6. Going-out score banner bug (shows "scored 0 points" always)

`computeRoundBanner` currently reads `publicState.roundResult.pointsAdded[outId]`
for the "X went out and scored N points!" line. Per `rules.ts`'s own
doc comment, `pointsAdded[outPlayerId]` is ALWAYS 0 by design (it
records each OTHER player's contribution, not the out player's own
gain). Fix: sum every value in `pointsAdded`
(`Object.values(publicState.roundResult.pointsAdded).reduce((a, b) => a + b, 0)`)
— this equals the actual amount added to the out player's score. Do
NOT touch `rules.ts` — its `pointsAdded` contract is correct and other
things may depend on the out-player's-own-entry-is-0 invariant.

## 7. Wild color not revealed on the discard pile

After a wild is played and a color is chosen, the discard pile's top
card should visually show the CHOSEN color, not the generic wild
gradient — `publicState.activeColor` already tracks this correctly,
it's just never threaded into the render. Add an optional
`activeColor?: UnoColor` prop to `UnoCardFace` (`UnoCard.tsx`): when
`card.color === 'wild'` (covers both `'wild'` and `'wild4'` kinds,
whose `.color` field is always the literal `'wild'`) AND `activeColor`
is provided, use `activeColor` for the face-color CSS class instead of
the wild-gradient class — same solid-color rendering as a numbered
card of that color, but keep the WILD/+4 text label (don't turn it
into a fake numbered card, just recolor it). When `activeColor` is
NOT provided (every other call site — cards still in a hand, never
yet played), behavior is unchanged, still the generic wild gradient.
Wire this prop ONLY at the discard-pile top-card render site in
`UnoTable.tsx` (`<UnoCardFace card={top} size="discard" activeColor={publicState.activeColor} />`)
— do not pass it anywhere else (hand cards, any other UnoCardFace call
site, must keep rendering wild cards generically, since they haven't
been assigned a color yet).

## 8. Forced-draw click-to-reveal (was: cards from an opponent's draw-two/wild-four appear instantly with no acknowledgment)

When another player's draw-two or wild-four increases YOUR hand, the
cards currently just appear silently. This needs a click-to-reveal
step — but this is PURELY a client-side presentation gate, not a
change to the host-authoritative engine: `rules.ts` already puts the
drawn cards into the target's hand atomically as part of resolving the
acting player's `PLAY_CARD`, and that's correct and must stay that way
(same reasoning `DealIntro` already relies on: the real state is fully
settled immediately, the UI is allowed to delay REVEALING it for a
beat). Do not add any new engine state (no `pendingDraw` on
`UnoPublicState`, no new action type).

Implementation: track `prevHandLenRef` (a ref holding the previous
render's `hand.length`) and `isMyTurn`/`hasDrawnThisTurn` context you
already have. When `hand.length` increases AND the increase did NOT
come from the local player's own just-completed `DRAW_CARD` (i.e. it
happened while it was NOT this player's turn, or while it was their
turn but they hadn't just clicked the deck themselves — the simplest
correct signal is: the local player didn't initiate it if `isMyTurn`
was false at the moment the hand grew), treat the newly-added cards
(the last `hand.length - prevHandLenRef.current` cards of the sorted
hand, or simplest: track which card ids were already known via a
`knownCardIdsRef: Set<string>` and treat any hand card whose id isn't
in that set as "unrevealed") as unrevealed: render them as
`UnoCardBack` (face-down) in their correct sorted position in the fan
instead of `UnoCardFace`, and show a small prompt (e.g. "You drew N
cards — click to reveal") that the player must click to flip them face
-up (a local `revealed: boolean` state, or clear the "unrevealed" set,
whichever is simpler to implement correctly). Play `'uno-draw'` at the
moment the prompt appears (see §9), not at the moment of reveal.

Keep this simple and self-contained in local component state — do not
overthink edge cases beyond: (a) it must not trigger for the local
player's own deliberate `DRAW_CARD` click (that already required a
click, no double-gating needed), (b) it must not permanently hide
cards if the player never clicks (a stuck game state is worse than a
missing animation — if in doubt, auto-reveal after a short timeout as
a safety net, e.g. 4-5s, OR simply don't gate legality: an unrevealed
card can still be clicked to reveal-and-select in one action if you
judge that's simpler and safer than a separate reveal step; use your
judgment and note which you chose and why).

## 9. Sounds

Six sound names already exist in the registry (`uno-call`,
`uno-called-on`, `uno-skip`, `uno-reverse`, `uno-draw`, `uno-wild`) —
call `play(...)` from the existing `useSound()` destructure at these
points, following the same "diff public state, only for transitions
the local player would actually witness" pattern already used for the
existing `shuffle`/`card-play`/`card-draw`/`round-win`/`game-win`/
`error` calls in this file's sound-diffing `useEffect`:

- `'uno-skip'` — a play whose `lastAction.card.kind === 'skip'` just
  landed (any player, not just yours — everyone should hear a skip).
- `'uno-reverse'` — same, for `kind === 'reverse'`.
- `'uno-wild'` — a play whose `lastAction.card.kind === 'wild'` or
  `'wild4'` just landed.
- `'uno-draw'` — when the local player's own hand is about to show the
  §8 reveal prompt (a forced draw from someone else's action), OR when
  the local player draws via their own deck click — pick whichever
  timing is simplest given how you implemented §8; a plain `DRAW_CARD`
  already gets the generic `card-draw` sound from the existing logic,
  so don't double-fire both for the same event — decide whether
  `uno-draw` REPLACES `card-draw` for Uno specifically (recommended,
  for a more game-flavored sound) or is additive, and note your choice.
- `'uno-call'` — a successful `CALL_UNO` where the caller IS the
  vulnerable player (a self-call) — diff `publicState.unoWindow` going
  from non-null to null where you can tell it was a self-resolution
  (simplest signal: the window was open on some player X, and
  `lastAction` doesn't reflect a new turn-ending play/draw/pass in the
  same tick — use your judgment on the cleanest signal available from
  the props you have; note what you used).
- `'uno-called-on'` — the local player specifically was CAUGHT (their
  own window closed via someone else's catch, i.e. their hand count
  just grew by exactly 2 outside of a draw-two/wild-four context).
  If distinguishing self-call from being-caught cleanly isn't feasible
  from the public state alone, use your best judgment and clearly note
  the limitation in your report rather than guessing silently.

If any of these signals genuinely aren't cleanly derivable from
`UnoPublicState` as it exists today, do NOT modify `rules.ts`/
`state.ts` to add a new field — implement the closest reasonable
approximation from existing fields and clearly flag the limitation in
your report. Getting the sound cue approximately right beats blocking
this whole spec on an engine change that's out of scope.

## Verify before reporting

`npx tsc -b --noEmit` silent. `npm test` green (no regressions in the
existing 947). `npm run build` clean. If you add tests for
`sortUnoHand` or the reveal-gate logic, that's welcome but not
required — use your judgment on whether the added logic is complex
enough to warrant it (a pure sort function is an easy, cheap win for a
test; the reveal-gate's local-state timing is harder to test
meaningfully without a DOM-timer harness, use your judgment). Report
every judgment call you made, especially in §8 and §9 where this spec
explicitly leaves you room to choose the simplest correct approach.
