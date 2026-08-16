# Spec 34f — UnoRoom, UnoResults, UnoRulesOverlay

Third of four Uno pieces (34d components, 34e table screen, both done →
34f these three screens → 34g App.tsx wiring). Presentational only —
none of these three components talk to `App.tsx`, PeerJS, or bot logic
directly; they receive state via props and call callback props, exactly
like every sibling Room/Results/RulesOverlay trio in this codebase.

You own EXACTLY these three new files:

- `src/screens/UnoRoom.tsx`
- `src/screens/UnoResults.tsx`
- `src/screens/UnoRulesOverlay.tsx`

Do NOT touch any other file (not `UnoTable.tsx`, not `App.tsx`, not
`route.ts` — those are separate specs). Before writing, READ in full:
`src/screens/MexicanTrainRoom.tsx`, `src/screens/WahooRoom.tsx`,
`src/screens/MexicanTrainResults.tsx`, `src/screens/WahooResults.tsx`,
`src/screens/MexicanTrainRulesOverlay.tsx`,
`src/screens/WahooRulesOverlay.tsx`, `src/screens/Room.tsx` (the
DIFFICULTIES pill-button convention), `src/screens/ChessRoom.tsx` (the
richer variant-card convention, defined via `.bs-variant-*` classes
that live in `BattleshipTable.css` and are already shared/reused
site-wide — you may reuse those same classes here, don't redefine
them), `src/card-games/uno/state.ts` (read `UNO_HOUSE_RULE_DEFS`,
`UnoHouseRuleDef`, `resolveHouseRules`, `UNO_MIN_SEATS`,
`UNO_MAX_SEATS` — all already built), and `Design Handoff/UNO.md`.

**Important, established fact from prior research — do not rediscover
this by grepping, just take it as given:** there is NO existing
generic house-rules-toggle-list component anywhere in this codebase,
and NO `<input type="checkbox">` anywhere in `src/**/*.tsx`. You are
designing this UI from scratch. The closest existing convention to
imitate is the selected/unselected pill-button pattern (`Room.tsx`'s
`DIFFICULTIES` row, or `ChessRoom.tsx`'s `.bs-variant-option`/
`.bs-variant-option--selected` cards) — a toggle button whose selected
state inverts colors, not a checkbox input. `UNO_HOUSE_RULE_DEFS` is
an array specifically so this list can grow later without new UI code
— render it with `.map()`, do not hardcode the one current rule's
label/description as literal JSX.

## `UnoRoom.tsx`

Prop interface, following `MexicanTrainRoomProps`'s naming exactly
(the file paths above are your reference for the shape — read them,
don't guess) but add what Uno additionally needs:

```ts
export interface UnoRoomProps {
  code: string
  localName: string
  isHost: boolean
  seats: { name: string; isBot: boolean; isHost: boolean }[]
  notice?: string | null
  houseRules: Record<UnoHouseRuleKey, boolean>       // host's currently-chosen overrides (guests see these read-only)
  difficulty: BotDifficulty                          // import from '../types' — same type Room.tsx/ChessRoom.tsx use
  onAddHouseBot: () => void       // host-only
  onToggleHouseRule: (key: UnoHouseRuleKey) => void   // host-only
  onSetDifficulty: (d: BotDifficulty) => void         // host-only
  onStartGame: () => void         // host-only
  onLeave: () => void
}
```

Seat list: mirror `MexicanTrainRoom`'s `slots` padding pattern exactly
(`Array.from({ length: UNO_MAX_SEATS }, (_, i) => seats[i] ?? null)`),
same empty-seat/filled-seat rendering, using Uno's brand color
(`#e11d2e`) wherever MT/Wahoo use their own brand hex. "Add house bot"
disabled once `seats.length >= UNO_MAX_SEATS`; "Start game" disabled
below `UNO_MIN_SEATS` (mirror MT's `MT_MIN_SEATS`-gated disable, not
Wahoo's hardcoded `< 2`, since Uno's min is a named export same as
MT's).

House-rules section (host-only controls; guests see the SAME chosen
state but the controls are non-interactive/disabled for them — read
how MT/Wahoo already disable host-only controls for guests and mirror
that exact convention, don't invent a new one): map over
`UNO_HOUSE_RULE_DEFS`, one toggle row per entry, each showing the
def's `label` and `description` and a pill/card control reflecting
`houseRules[def.key]`, calling `onToggleHouseRule(def.key)` on click
when `isHost`.

Bot-difficulty picker: reuse the `Room.tsx` DIFFICULTIES pill-button
convention (three buttons, easy/medium/hard, selected one inverted to
ink/white) — this is a single room-wide setting applied to every house
bot's Uno-call reflex timing (the wiring spec, 34g, is what actually
uses this value; this screen only presents and reports the choice).
Host-only interactive, guests see it read-only, same disabling
convention as the house-rules section.

Rules overlay: same convention as MT/Wahoo — local `rulesOpen` state,
a "Rules" pill button in the header opens `<UnoRulesOverlay
onClose={...} />`, mounted at the bottom of this component. (Confirmed
precedent: MT/Wahoo mount their RulesOverlay inside Room, not App —
follow that, don't add a separate route/branch for it.)

## `UnoResults.tsx`

Prop interface, mirroring `MexicanTrainResultsProps` (Uno has private
hands like MT, not like Wahoo, but Results only needs public
end-of-match data so the shape is the same regardless):

```ts
export interface UnoResultsProps {
  localPlayerId: string
  localName: string
  names: Record<string, string>
  colors: Record<string, string>
  publicState: UnoPublicState
  isHost: boolean
  notice?: string | null
  onRematch: () => void
  onBackToShelf: () => void
}
```

Guard-render `null` unless `publicState.stage === 'over' &&
publicState.matchWinnerId !== null` (mirror MT's exact guard shape).
Build a ranked row list from `publicState.seatOrder` and
`publicState.scores` — Uno scoring is DESCENDING (higher score wins,
first to `UNO_TARGET`), so sort like Wahoo's descending convention,
not MT's ascending one — confirm this against `UNO_TARGET`/scoring
comments in `state.ts` before writing the sort, don't assume. Same
pill-row rendering (rank/dot/name/score), winner's row filled with
their color, same "Again" (host-only) / "Back to the shelf" (everyone)
/ "waiting for host" (guest) action row, same `play('game-win')` on
mount via `useSound()`.

## `UnoRulesOverlay.tsx`

`{ onClose: () => void }` only, no other props — pure static content,
same `overlay-backdrop`/`overlay-panel` shared CSS classes as MT/
Wahoo's overlays, same header row (title + Close button), Uno's brand
color for the `<h2>`. Content: a short overview paragraph plus a
bulleted key-facts list (mirror Wahoo's flatter single-list style,
not MT's two-tier style, since Uno doesn't need a second "finer rules"
box) covering: standard Uno rules in brief (match color/number/type or
play a wild anytime; skip/reverse/draw-two apply immediately; in a
2-player game reverse acts as a second skip; draw-one-or-play-if-legal
-else-pass; going out scores you the rest of the table's hands; first
to 500 wins), the Uno-call mechanic in plain language (get down to one
card and you must call "Uno" before someone else catches you, or you
draw two cards as a penalty), and a one-line mention that this table
supports 2–10 players with optional house rules chosen in the lobby
(don't hardcode "draw until you can play" as if it's always on — say
it's an optional house rule).

## Verify before reporting

`npx tsc -b --noEmit` silent. `npm run build` clean. No tests required
(matches every sibling Room/Results/RulesOverlay trio — confirm and
report that confirmation). Report files changed, verbatim tsc/build
output, and any ambiguity you resolved with a note on what you chose
and why — especially the house-rules-toggle and difficulty-picker UI,
which have no exact precedent to copy and required a judgment call.
