# Spec 36 — Rummy N-player screens + wiring (combined)

Second milestone of the Rummy+Phase10 charter. Converts Rummy's screens
AND `App.tsx` wiring from hardcoded 2-player to 2-4 players, in ONE
spec — NOT split into separate screens/wiring specs like Uno's charter
did, because Rummy (unlike Uno, which was net-new) already has a
WORKING 2-player wiring in `App.tsx` that calls `RummyTable`/
`RummyRoom`/`RummyResults` with their CURRENT 2-player prop shapes.
Changing those prop shapes without updating `App.tsx` in the SAME
commit would break the build (`tsc`/`build` must stay clean at all
times, per this project's own `CLAUDE.md` — non-negotiable). Land this
as one coherent change.

You own edits to EXACTLY these files:

- `src/screens/RummyRoom.tsx`
- `src/screens/RummyTable.tsx`
- `src/screens/RummyTable.css`
- `src/screens/RummyResults.tsx`
- `src/App.tsx` (Rummy wiring section only — grep for `rummy`/`Rummy` and
  touch only those lines; do not touch any other game's wiring)
- `src/screens/Landing.tsx` (one string — the Rummy shelf tile's `note`,
  if one exists; if Rummy currently has no player-count note, add one:
  `'2–4 players'`)
- `README.md` (one phrase — add Rummy's seat range to the sentence that
  already lists Wahoo/Mexican Train/Uno's ranges, same pattern used
  when Uno was added)

Engine (`src/card-games/rummy/state.ts`/`rules.ts`) is DONE (spec 35,
already landed) — do not touch it. `RUMMY_MIN_SEATS`/`RUMMY_MAX_SEATS`
(2/4) and `RummyPublicState.seatOrder` already exist, import them.

## Read before writing (mirror these precisely, this is not a place to
invent a different pattern)

- `src/screens/UnoRoom.tsx` — the N-seat lobby pattern (seat slots
  `Array.from({length: MAX_SEATS}, (_,i) => seats[i] ?? null)`,
  "Add house bot" disabled at cap, "Start game" disabled below min).
- `src/screens/UnoResults.tsx` — the N-player ranked-standings pattern.
- `src/screens/UnoTable.tsx`'s opponent tile grid (`.uno-opp-tile` and
  its CSS) — the WRAPPING GRID MECHANICS to mirror (flex-wrap
  container, per-tile border/turn-fill treatment), NOT the tile
  CONTENT (Uno's tile shows a hidden count; Rummy's must show real
  melds — see §2 below for Rummy-specific content).
- `src/App.tsx`'s Uno wiring section in full (`unoBroadcast`,
  `startUnoHost`'s multi-guest `onJoin`, `HostHandle.sendTo` per non-
  host non-bot seat, `addUnoHouseBot`, `runUnoBotsIfNeeded`/
  `runUnoBots`, `unoRematch`) — this is the exact wiring shape to
  mirror for Rummy's `App.tsx` section. Rummy's CURRENT wiring (also
  read this, to know exactly what you're replacing) is a single-guest-
  or-single-bot direct-connect model with no lobby broadcast loop —
  you are replacing it with Uno's full lobby-broadcast + per-guest
  `sendTo` + bot-per-seat model.

## 1. `RummyRoom.tsx` — N-seat lobby

Currently: hardcoded exactly 2 slots (you + one "Waiting…" slot), a
single "Play the house" button (adds exactly one bot, ends the lobby
immediately). Replace with `UnoRoom.tsx`'s pattern: `seats:
{name: string; isBot: boolean; isHost: boolean}[]` prop, `Array.from(
{length: RUMMY_MAX_SEATS}, (_,i) => seats[i] ?? null)` slot rendering,
"Add house bot" (repeatable, disabled at `RUMMY_MAX_SEATS`), "Start
game" button (disabled below `RUMMY_MIN_SEATS`) — Rummy currently has
NO explicit "start" step (adding a bot immediately starts the match);
this changes to Uno's model where the host adds 0+ bots/waits for 0+
guests, then explicitly presses Start. No house-rules section (Rummy
has none) — this is simpler than `UnoRoom.tsx` in that one respect,
don't invent a house-rules section that doesn't exist for this game.
Rummy brand color: reuse whatever's already used in this file
(`var(--green-text)`, confirmed from the current file's Rummy chip).

## 2. `RummyTable.tsx`/`.css` — opponent tile grid with full meld display

**Props**: replace the three scalar opponent props (`opponentName`,
`opponentColor`, `opponentHandCount`) with `names: Record<string,
string>` and `colors: Record<string, string>`, matching Uno's exact
prop-naming convention. `opponentHandCount` is no longer passed — read
it from `publicState.handCounts[seatId]` per opponent, same as Uno.
Compute the opponent list as `publicState.seatOrder.filter(id => id
!== localPlayerId)` (NOT `publicState.turn.playerOrder.find(...)`,
which only ever found ONE id and is undefined for 3+ players — this is
the one line that MUST change first or nothing else compiles
meaningfully). `localName`/`onOpenRules` stay unused-but-kept exactly
as today (do not remove them, do not "fix" that pre-existing pattern).

**Layout**: replace `.rummy-their-side` (a single fixed block) with a
wrapping tile grid mirroring Uno's `.uno-opp-rail`/`.uno-opp-tile`
CONTAINER mechanics (flex-wrap, gap) — but do NOT reuse Uno's fixed/
compact tile sizing or its capped card-back stack: Rummy's tile content
is fundamentally different (real, readable meld cards a player needs
to actually read the values of, not a hidden count) and per the
existing "Rummy and Phase10 Full Tables.dc.html" mockup's own working
reference at 6 players (read it if you still have access to the
downloaded file path the lead used; if not, follow this spec's
description exactly), each tile's HEIGHT is content-driven — a player
with 3 melds gets a taller tile than a player with 1, nothing is
capped, cropped, or hidden behind a tap. With Rummy's max of 3
opponents (4-player cap), you will rarely if ever see more than one
row — don't over-engineer for a many-row case Uno needed and Rummy
doesn't.

**Per-tile content**, one tile per opponent seat:
- Seat color dot + name (mirror Uno's `.uno-seat-dot`/`.uno-opp-name`
  treatment).
- Hidden-hand indicator: keep BOTH the existing card-back fan
  (`CardBack size="fan"`, capped via `Math.min(handCount, 14)`, same
  `fanCount` pattern already in this file) AND the `{count} cards ·
  hidden` text label — this is the established Rummy convention
  already in the file, just re-parented into the per-seat tile instead
  of the single hardcoded block. Do not shrink it to Uno's tiny `size=
  "small"` treatment — Rummy already uses the LARGER `size="fan"` back
  and that's correct to keep (unlike Uno, Rummy's opponent count is
  capped at 3, so there's no tile-width pressure forcing a smaller
  back).
- Every meld this seat has laid down, using the EXISTING, UNCHANGED
  `MeldCluster` component (do not modify `MeldCluster` itself — it
  already takes `cards`/`ownerColor`/`ownerShadow`/`onLayOff` and is
  shared by every side already; reuse it exactly, tinted with this
  seat's color).
- Turn highlight: add a `--turn` fill treatment to the tile
  (`background`/`borderColor` = seat color, white text, mirroring both
  Uno's `.uno-opp-tile--turn` treatment AND this file's own turn-chip
  color logic already used elsewhere) when `currentPlayer(publicState.
  turn) === seatId` — this is new for Rummy (the old 2-player version
  showed whose turn it was via a separate chip, not a tile fill); add
  it for consistency with the established multi-seat pattern, keeping
  whatever existing single "whose turn" chip/status text this file
  already has elsewhere UNCHANGED (both can coexist — the CHIP says it
  in words, the TILE fill shows it visually at a glance, same as MT/
  Wahoo/Uno already do with their own turn-chip + tile-fill pairing).

**Layoff generalization — read this carefully, this is the trickiest
part of this spec.** The CURRENT 2-player code has exactly two
rendering rules, keyed off two booleans (is the layer me-or-them, is
the target me-or-them):
- A layoff onto a meld's OWN OWNER's meld (self-extension): merge
  directly into that meld's `cards` array before rendering (no
  caption, cards just appear as part of the same cluster). This rule
  is UNCHANGED and needs no generalization — it's already keyed by
  `l.targetPlayerId === l.playerId`, which works identically at any
  seat count.
- A layoff by someone OTHER than the meld's owner (cross-layoff):
  renders as a separate captioned mini-cluster (`.rummy-meld-extension`
  wrapping a `MeldCluster`) that stays on the LAYER's own side, never
  merged into the target's cluster. The caption text today is either
  the literal `"on your group"` (hardcoded, when the LOCAL player is
  the TARGET) or `` `on ${opponentName}'s group` `` (when the LOCAL
  player is the LAYER). **Generalize the caption rule to**: caption =
  `targetPlayerId === localPlayerId ? "on your group" : \`on ${names[
  targetPlayerId]}'s group\`` — this exact expression covers all four
  cases that exist at N>2 players (I am the layer targeting an
  opponent's meld → shows their name; an opponent is the layer
  targeting MY meld → "on your group"; an opponent is the layer
  targeting a DIFFERENT opponent's meld → shows that different
  opponent's name; I am the layer targeting my OWN meld → this can't
  happen, self-extensions are handled by the other branch above).
  **Render location generalizes to**: every cross-layoff renders in the
  LAYER's own section — if the layer is `localPlayerId`, it renders in
  "your melds" (the unchanged local section); if the layer is any
  opponent seat, it renders in THAT opponent's own tile (not the
  target's tile). Compute this once per render: for each seat's melds,
  gather every layoff targeting them, split into self-extensions
  (merge) vs. group-by-layer cross-layoffs (one captioned mini-cluster
  PER DISTINCT LAYER seat, using ALL of that layer's cards on that
  specific target meld combined into one cluster, not one cluster per
  individual `RummyLayoff` record — a layer could have laid off
  multiple times onto the same meld across a round).

**"Your melds" section**: stays structurally the same (unchanged
container, unchanged `MeldCluster` usage for your own base melds), but
its cross-layoff caption must use the SAME generalized rule above
(today it hardcodes `` `on ${opponentName}'s group` `` — this becomes
`` `on ${names[l.targetPlayerId]}'s group` `` using whichever seat that
particular layoff actually targeted, since you can now lay off onto
any of up to 3 different opponents' melds, not just "the opponent").

## 3. `RummyResults.tsx` — N-player standings

Replace the hardcoded 2-row build (`[{id: localPlayerId,...}, {id:
opponentId,...}]`) with a loop over `publicState.seatOrder`, same
shape as `UnoResults.tsx`'s ranked-row construction. Replace the
`opponentName: string` / fixed 2-color-palette prop shape with `names:
Record<string,string>` / `colors: Record<string,string>` (matching the
Table screen's new props exactly — don't invent a different shape
between the two screens). Sort DESCENDING (Rummy's own scores are
already "higher is better" per the existing 2-player code's `b.score -
a.score` — confirm this is still correct for Rummy specifically, don't
just copy Uno's sort direction assumption without checking against
Rummy's actual scoring semantics, which you already generalized in
spec 35).

## 4. `App.tsx` wiring — mirror Uno's spec-34g shape exactly

Grep for every `rummy`/`Rummy` site in `App.tsx` and replace the
direct-connect 2-player model with Uno's full lobby model:
- View type gets a `lobby | game` shape like `UnoView` (roster during
  lobby, `publicState` + `hand` + `names` during game).
- `startRummyHost`: creates the host connection with a multi-guest
  `onJoin` (reject once `seats.length >= RUMMY_MAX_SEATS` or the match
  has started, same spectator-block message style Uno uses), broadcasts
  the lobby roster, does NOT immediately create the game session (that
  now happens on an explicit "Start game" from `RummyRoom`, mirroring
  `unoStart()`).
- `addRummyHouseBot`: adds one bot seat, repeatable up to the cap
  (was: added exactly one bot and immediately started the match —
  that behavior is gone, replaced by the lobby model).
- A new `rummyStart()` function (mirrors `unoStart()`): validates seat
  count, calls `createRummyGame(seatOrder, seed)`, broadcasts.
- `rummyBroadcast()` (mirrors `unoBroadcast()`): lobby-phase broadcasts
  the roster; game-phase computes the host's own snapshot locally and
  `sendTo`s every other non-bot seat their own `deriveSnapshot` — this
  is the part that's GENUINELY NEW for Rummy (today, with exactly one
  possible guest, a single `broadcast` was safe; with up to 3 guests,
  broadcasting anyone's hand would leak it to the others, exactly the
  reason Mexican Train/Wahoo/Uno all needed `sendTo`).
- Bot turn loop (`runRummyBotsIfNeeded`/`runRummyBots`): mirror Uno's
  shape, but there is no Uno-style pacing concern to replicate here —
  reuse this codebase's shared `BASE_MS` UNLESS you find Rummy already
  has (or per spec 35's own engine work implies) a reason to need its
  own constant; if you're unsure, use `BASE_MS` and note the choice in
  your report rather than inventing a new constant speculatively.
- `rummyRematch()`: mirrors `unoRematch()` — rebuild via
  `createRummyGame(seatOrder, seed)`, keep the seat order, carry
  revision forward.
- Room code prefix stays `RM-` (unchanged, just the lobby logic behind
  it changes).
- Seat-ink palette: Rummy currently has no per-seat fixed palette
  (2-player only needed the `LOCAL_COLOR`/`OPPONENT_COLOR` pair inside
  `RummyResults.tsx` itself). Add a fixed 4-color palette at the
  `App.tsx` level (mirror `UNO_SEAT_INKS`'s pattern, just 4 entries
  instead of 6 — reuse the first 4 of Uno's own palette for visual
  consistency across games, don't invent new hex values), zipped
  against `seatOrder` the same way Uno does it.

## Verify before reporting

`npx tsc -b --noEmit` silent. `npm test` green (958 baseline — this
spec touches no `*.test.ts` files, so the count should be unchanged
unless you judge a new test genuinely necessary; screens/wiring
changes in this codebase's established practice don't get their own
test files, matching every sibling Room/Table/Results screen). `npm
run build` clean. Report every judgment call, especially: the exact
layoff-generalization logic you implemented (walk through a concrete
3-4 player example by hand, not just describe it abstractly), how you
handled the bot-pacing constant choice, and confirm you did NOT touch
`src/card-games/rummy/state.ts`/`rules.ts` (spec 35's work) or any
other game's file. You have no way to visually verify the tile grid or
layoff rendering — say so plainly; the lead will do a live visual
check separately, per this charter's definition of done.
