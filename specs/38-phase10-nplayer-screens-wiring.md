# Spec 38 — Phase 10 N-player screens + wiring (combined)

Final milestone of the Rummy+Phase10 charter. Converts Phase 10's
screens AND `App.tsx` wiring from hardcoded 2-player to 2-6 players,
in ONE spec — same reason Rummy's spec 36 combined screens+wiring
rather than splitting them: Phase10 already has WORKING 2-player
wiring, and changing screen prop shapes without updating `App.tsx` in
the same commit would leave `tsc`/`build` red at an intermediate
state, which this project's `CLAUDE.md` never allows.

**Read `specs/36-rummy-nplayer-screens-wiring.md` FIRST, in full, and
the actual landed Rummy diff it produced** (`src/screens/RummyRoom.tsx`,
`RummyTable.tsx`/`.css`, `RummyResults.tsx`, and the Rummy section of
`App.tsx`) — Phase 10's pre-conversion screens/wiring are structurally
almost identical to Rummy's pre-conversion shape (same scalar
`opponentName`/`opponentColor`/`opponentHandCount` prop triad, same
`.find(id => id !== localPlayerId)` single-opponent anti-pattern
repeated at 4 call sites, same self-vs-cross-owner extension-rendering
convention for `hits` as Rummy's `layoffs`, same minimal 1-slot Room,
same hardcoded 2-row Results, same single-guest-or-single-bot direct-
connect `App.tsx` model) — mirror that landed work directly wherever
this spec says "same as Rummy," don't re-derive it from scratch.

You own edits to EXACTLY these files:

- `src/screens/Phase10Room.tsx`
- `src/screens/Phase10Table.tsx`
- `src/screens/Phase10Table.css`
- `src/screens/Phase10Results.tsx`
- `src/App.tsx` (Phase10 wiring section only — grep for `phase10`/
  `Phase10`; do not touch Rummy's, Uno's, or any other game's wiring)
- `src/screens/Landing.tsx` (Phase10 shelf tile's `note`)
- `README.md` (Phase10's seat range, added to the sentence that
  already lists Wahoo/Mexican Train/Uno/Rummy's ranges)

Engine (`src/card-games/phase10/state.ts`/`rules.ts`) is DONE (spec
37, already landed) — do not touch it. `PHASE10_MIN_SEATS`/
`PHASE10_MAX_SEATS` (2/6) and `Phase10PublicState.seatOrder` already
exist, import them.

## Parts that are a DIRECT mirror of Rummy's spec 36 — apply the exact
same technique, substituting Phase10's names/types

1. **`Phase10Room.tsx`**: convert to the N-seat lobby exactly like
   `RummyRoom.tsx` was converted (seat slots up to `PHASE10_MAX_SEATS`,
   repeatable "Add house bot" capped, explicit "Start game" gated at
   `PHASE10_MIN_SEATS`, no house-rules section). Phase10 brand color:
   `var(--violet)` (already used in this file's chip).
2. **Opponent identity**: replace every one of the FOUR
   `publicState.turn.playerOrder.find((id) => id !== localPlayerId)!`
   call sites (in `Phase10Table.tsx`, `Phase10Results.tsx`, and TWICE
   in `App.tsx` — grep for all of them, don't assume you found every
   occurrence from this list) with `publicState.seatOrder.filter(id =>
   id !== localPlayerId)` (Table/App.tsx, producing an opponent LIST)
   or the appropriate N-player row-loop (Results — see below, NOT a
   simple filter-and-done, read the custom-sort note first).
3. **`Phase10Table.tsx`/`.css` opponent tile grid**: same wrapping-
   grid container mechanics as Rummy's `.rummy-opp-tile` (content-
   driven height, NOT Uno's compact fixed sizing — Phase10 groups are
   real, readable cards a player needs to read the values of, exactly
   like Rummy's melds). Per-tile content: seat dot/name, hidden-hand
   fan (`Phase10CardBack size="fan"`, capped `Math.min(count, 14)`,
   same as today) + count text, every laid `GroupCluster` for that
   seat (UNCHANGED component, still takes `cards`/`type`/`ownerColor`/
   `ownerShadow`/`caption`/`onHit` — the `caption={`Phase ${group.
   phaseNumber}`}` prop is untouched, already per-group data, just
   keep passing it through per opponent tile exactly as today), turn-
   fill highlight mirroring Rummy's `.rummy-opp-tile--turn`.
4. **`hits` generalization** (Phase10's `layoffs` equivalent): same
   exact rule Rummy's spec 36 used for `layoffs` — self-hits (`h.
   playerId === h.targetPlayerId`) merge silently into the base group;
   cross-hits render on the LAYER's own section (their tile, or "your
   groups" if the layer is you), grouped by `(layer, targetGroupIndex)`
   pair so repeated hits from the same layer onto the same group
   combine into one cluster, captioned `targetPlayerId ===
   localPlayerId ? "on your group" : \`on ${names[targetPlayerId]}'s
   group\``. Write the equivalent of Rummy's `crossLayoffGroups`/
   `selfExtensionCards`/`crossLayoffCaption` helpers for `hits` — same
   logic, `Phase10Hit`'s field names (`playerId`/`targetPlayerId`/
   `targetGroupIndex`/`cards`), and `p10-group-extension`/
   `p10-group-extension-caption` CSS classes (already exist, reuse
   them, they need no changes — only the JS logic generating what goes
   inside them changes).
5. **`Phase10Room`/`Phase10Table`/`Phase10Results` props**: same
   `names: Record<string,string>` / `colors: Record<string,string>`
   replacement for the scalar opponent props, same pattern as Rummy.
6. **`App.tsx` wiring**: same full rewrite from single-guest-or-single-
   bot direct-connect to the lobby/broadcast/`sendTo`/bot-per-seat
   model, mirroring Rummy's `rummyBroadcast`/`startRummyHost`/
   `addRummyHouseBot`/`rummyStart`/bot-loop/`rummyRematch` shape
   exactly, substituting Phase10's types/action names. Fix the
   `phase10Rematch`'s `as [string, string]` cast — use `ps.seatOrder`
   (a real `string[]`) instead of casting `turn.playerOrder`. Add a
   4-to-6-entry seat-ink palette (reuse Uno's first 6 colors, matching
   the palette-reuse convention Rummy's spec 36 established for its
   own 4-entry version). Bot pacing: reuse shared `BASE_MS`, same
   choice Rummy's spec 36 made, unless you find a concrete reason
   Phase10 needs its own constant (unlikely — note your reasoning
   either way).
7. **`Landing.tsx`/`README.md`**: same one-line copy updates as spec
   36 made for Rummy — Phase10's shelf note becomes `'2–6 players'`,
   README's seat-range sentence gains a Phase10 clause.

## Parts that are GENUINELY NEW — no Rummy precedent, read carefully

**A. The Phase Ladder must become N-wide, not just re-parented.**
`PhaseLadder` currently takes `localPhaseIdx` + a SINGLE
`opponentPhaseIdx`/`opponentColor` pair and renders one ring-marker for
the single opponent at their current phase step, alongside your own
dot. Generalize to accept an array — `opponents: { seatId: string;
phaseIdx: number; color: string }[]` (or equivalent) — and render one
marker per opponent at THAT seat's current phase-ladder position, not
just one. Multiple opponents can legitimately be on the SAME phase
number simultaneously (nothing analogous exists in Rummy) — the
existing single-marker rendering (`p10-ladder-chip--opponent-here`
plus a colored dot in `.p10-ladder-dots`) needs to become a small
stack/row of markers at that ladder step when more than one opponent
shares it, not overlap into an unreadable blob. Use your judgment on
the exact visual treatment (a tight row of small colored dots is
probably sufficient — this is a small indicator, not the main content
of the screen) but it must be legible at up to 5 opponents sharing one
step. The ladder itself (the row of 10 phase-number chips, `PHASES`
array) is a single fixed reference display and does NOT change —
only the per-seat marker logic does. This component and its render
call site both live in `Phase10Table.tsx`; find both.

**B. `Phase10Results.tsx`'s sort is NOT a plain score sort — preserve
this exactly.** The current comparator pins whoever `matchWinnerId`
is FIRST regardless of score, then sorts everyone else by score
ascending (lower is better, per this game's actual scoring — verify
this against `ScoreHeader`'s `hint="lower wins"` usage elsewhere in
this file before you touch anything, don't assume Uno/Rummy's
descending convention applies here). When generalizing the 2-row
literal-array build to a loop over `publicState.seatOrder` (same
transformation as Rummy's spec 36), KEEP the winner-pinned-first,
everyone-else-ascending comparator — do not collapse it into a plain
`.sort((a,b) => a.score - b.score)`, that would silently change
ranking behavior for the one case that matters most (the winner should
always show first, even if a wilder round briefly put someone else at
a numerically lower score before the match actually ended).

## Verify before reporting

`npx tsc -b --noEmit` silent. `npm test` green (962 baseline — this
spec touches no `*.test.ts` files unless you judge one genuinely
necessary; screens/wiring don't get dedicated tests in this codebase's
established practice). `npm run build` clean. Report every judgment
call, especially: the exact `hits` generalization logic (walk through
a concrete 3+ player example by hand), how you generalized the Phase
Ladder's multi-opponent-per-step visual treatment, and confirm the
Results winner-pinned sort survived unchanged in behavior. You have no
way to visually verify any of this — say so plainly; the lead does the
mandatory visual check separately, same as every prior milestone this
charter.
