# Spec 34g — Uno wiring: App, route, landing, README

Fourth and final Uno piece (34/34a module, 34b call mechanism, 34c
house rules, 34d card components, 34e table screen, 34f Room/Results/
RulesOverlay — all done and landed). This spec wires everything built
so far into the live app: PeerJS session lifecycle, bot turn loop, the
NOVEL bot Uno-call reflex system (no precedent — read this spec's
section on it carefully, it's the highest-risk part), routing, and the
landing shelf.

You own edits to EXACTLY these files (no new files except
`src/state/route.test.ts` additions, which is an EDIT to an existing
file, not a new one):

- `src/App.tsx`
- `src/state/route.ts`
- `src/state/route.test.ts`
- `src/screens/Landing.tsx`
- `README.md`

Do NOT touch `src/net/peer.ts` — `HostHandle.sendTo` already exists
(added for Mexican Train) and needs no changes for Uno.

## Baseline: mirror Mexican Train's wiring, not Wahoo's

Uno has PRIVATE per-seat hands (like Mexican Train) and a VARIABLE
2–10 seat count (unlike MT's fixed 4, unlike Wahoo's fixed 2–4). Grep
`App.tsx` for `mt`/`MT`/`MexicanTrain`/`MT-` and mirror EVERY site:
imports, view type (`lobby`|`game` kinds, `game` carrying `hand`),
state + refs (role/code/localPlayerId/view/connection/notice/started/
seats/dropped, each with a `Ref` shadow), host creation with
multi-guest lobby broadcast + spectator-block rejection message ("Game
in progress — spectating comes later."), guest join, per-seat bot
turn loop, replace-dropped-guest-with-bot mid-match, results, leave/
reset, `pushGameUrl`, `liveGameNow`. Read the actual MT block in full
before writing anything — this spec below only calls out where Uno
DIFFERS from that baseline; anywhere it doesn't call out a difference,
copy MT's approach exactly.

## 1. Prefix and routing

`UN-` prefix (unclaimed — confirmed against every existing prefix:
`RM-`/`P10-`/`BS-`/`DM-`/`WH-`/`CK-`/`MT-`/`CH-`). Add the
`code.startsWith('UN-')` branch to the guest-join dispatcher (mirror
the existing chain's exact `if/else if` shape). Add `'uno'` to
`RoutedGame` and `GAME_SEGMENTS` in `route.ts` (segment `'uno'`), a
case in `hostGameFromBoot`'s switch, an entry in `liveGameNow()`
(pattern: `if (unoRole && unoStarted && unoView?.kind === 'game' &&
unoView.publicState.stage !== 'over') return 'uno'`), and
`pushGameUrl('uno')` calls in the new `startUnoHost`/`startUnoGuest`.
Add the same route.test.ts cases every other game gets for
`gamePath`/`gameFromPath`/`decideBoot` with `'uno'` (mirror an
existing game's test block, e.g. `'mexican-train'`'s, substituting
`'uno'`).

## 2. Session creation and variable seat count

Lobby caps at `UNO_MAX_SEATS` (10), Start enabled once
`seats.length >= UNO_MIN_SEATS` (2) — NOT a fixed-count requirement
like MT's `==4`; Uno's seat count is whatever's seated when the host
presses Start, same flexible-count pattern Farkle/Yahtzee use for
their 2–8 range (grep those if MT's fixed-4 gate isn't a good
template — Uno needs "at least min, up to max, host decides when to
start" not "exactly N").

`createUnoGame(seatOrder, seed, houseRules)` — the `houseRules`
param is the host's chosen overrides from the lobby (see §4). Actions
via `applyUnoAction`.

## 3. Per-guest snapshot delivery

Identical mechanism to MT's `mtBroadcast()` (deriveSnapshot + sendTo
per non-host non-bot seat, broadcast only for the lobby roster) — copy
that pattern exactly, substituting Uno's session/types. View type:

```ts
type UnoView =
  | { kind: 'lobby'; roster: { name: string; isBot: boolean; isHost: boolean }[] }
  | { kind: 'game'; revision: number; publicState: UnoPublicState; hand: UnoCard[]; names: Record<string, string> }
```

## 4. House rules + bot difficulty (chosen in the lobby, per spec 34f)

Lobby state: `unoHouseRules: Record<UnoHouseRuleKey, boolean>` (host
only, initialized from `resolveHouseRules()` i.e. all defaults, mutated
via `onToggleHouseRule` toggling one key and re-broadcasting the
lobby roster... but the roster type doesn't carry house rules currently
— EXTEND the lobby `UnoView`'s `{kind:'lobby'}` variant with
`houseRules` and `difficulty` fields so guests see the host's current
choices read-only in `UnoRoom`, e.g.:
```ts
| { kind: 'lobby'; roster: {...}[]; houseRules: Record<UnoHouseRuleKey, boolean>; difficulty: BotDifficulty }
```
`unoDifficulty: BotDifficulty` (host only, default `'medium'`, changed
via `onSetDifficulty`), broadcast the same way. Both values get passed
into `createUnoGame(seatOrder, seed, unoHouseRules)` when the host
presses Start; `unoDifficulty` is NOT passed into game creation at all
— it is consumed ONLY by this file's own bot Uno-call reflex system
(§6 below), never by `unoBotStrategy` (confirmed: `unoBotStrategy` has
no difficulty parameter and this spec must not add one to it — Uno's
"difficulty" tunes Uno-call reflex timing only, not card-play move
quality, per the original design decision).

## 5. Bot turn loop (normal per-turn actions)

Mirror MT's `runMTBots`/`runMTBotsIfNeeded`/actor-key/stale-check
template exactly, renamed for Uno. Actor key must include every field
that can change without `turn.turnNumber` incrementing within the SAME
player's turn (a draw-then-play is two actions, same turn number) —
use something like `` `${stage}:${turn.turnNumber}:${hasDrawnThisTurn}:${pendingWild !== null}:${stockCount}:${discardPile.cards.length}` ``
so the loop re-evaluates after a draw that doesn't advance the turn.
Strategy: `unoBotStrategy` via `runUnoBotTurn`. No special post-action
pause needed (no MT-horn-buffer equivalent) unless you find the sound
timing needs one — if so, keep it short and note why.

## 6. Bot Uno-call reflexes — read this section carefully, novel mechanism

`CALL_UNO` is NOT part of `unoBotStrategy` and is NOT gated by turn
ownership (per spec 34b, any seated player may call the one open
window at any time). This means bots need a SEPARATE reflex system
that runs independently of the per-turn bot loop in §5 — triggered by
`unoWindow` changing, not by whose turn it is.

**State to track** (new refs, host-side only):
- `unoWindowKeyRef = useRef<string | null>(null)` — the vulnerable
  seat's playerId, or null when no window is open. This must use the
  SAME re-keying property as `UnoTable`'s `useCatchStagger` hook
  (already built, spec 34e): a window closing and the SAME player's
  window reopening later is still a real "change" worth re-scheduling,
  because it necessarily passes through `null` in between (spec 34b:
  destroyed windows are never reopened stale, only a fresh later-turn
  window can recur) — so a plain `current !== new` comparison on
  `playerId ?? null` is correct and sufficient, no extra generation
  counter needed for THAT part.
- `unoReflexGenRef = useRef(0)` — incremented every time the window
  changes (opens, closes, or re-opens for someone else), used to
  invalidate any `setTimeout`s scheduled against a now-stale window so
  a delayed reflex fired against an old window never fires a stale
  `CALL_UNO` after that window already closed.

**Trigger point**: call a new `checkUnoBotReflexes()` function at the
END of `unoBroadcast()` (i.e. after every accepted action of ANY kind
updates `unoSessionRef.current` — a play, a draw, a pass, a color
choice, another CALL_UNO, or a round transition), so it observes every
`unoWindow` value the host session ever produces, not just the ones
caused by bot turns.

**Algorithm**:
```
function checkUnoBotReflexes() {
  const session = unoSessionRef.current
  if (!session) return
  const window = session.session.publicState.unoWindow
  const newKey = window?.playerId ?? null
  if (newKey === unoWindowKeyRef.current) return   // no real change
  unoWindowKeyRef.current = newKey
  const myGen = ++unoReflexGenRef.current           // invalidates any pending timers from the previous window
  if (newKey === null) return                       // window just closed, nothing new to schedule
  for (const seat of unoSeatsRef.current) {
    if (!unoBotSeatsRef.current.has(seat.playerId)) continue
    const isSelf = seat.playerId === newKey
    const { delayMs, skip } = rollUnoBotReflex(unoDifficultyRef.current, isSelf)
    if (skip) continue
    const targetPlayerId = newKey
    setTimeout(() => {
      if (unoReflexGenRef.current !== myGen) return   // window changed/closed since this was scheduled
      attemptUnoBotCall(seat.playerId, targetPlayerId)
    }, delayMs)
  }
}

function attemptUnoBotCall(callerId: string, targetPlayerId: string) {
  const session = unoSessionRef.current
  if (!session) return
  if (session.session.publicState.unoWindow?.playerId !== targetPlayerId) return  // already closed
  const result = applyUnoAction(session, callerId, { type: 'CALL_UNO', targetPlayerId })
  if (!result.outcome.ok) return
  unoSessionRef.current = result.uno
  unoBroadcast()   // this re-invokes checkUnoBotReflexes(), which will see the window is now null and bump the gen, correctly invalidating any other still-pending timers from this same window
}
```

**`rollUnoBotReflex(difficulty, isSelf)` timing** — this is a feel
tuning knob, not correctness-critical, but the RANGES matter for the
gameplay dynamic the user explicitly wants: bots must sometimes
genuinely miss their own self-call (their delay must sometimes exceed
what a fast catcher would need), and this must NOT be "fixed" later
to make bots more reliable — that's the intended, load-bearing
behavior. Use three tiers keyed off `BotDifficulty`, e.g.:

- `easy`: delay uniformly random in [900, 1500]ms, ~20% skip chance
- `medium`: delay uniformly random in [600, 1100]ms, ~10% skip chance
- `hard`: delay uniformly random in [400, 800]ms, ~3% skip chance

(`isSelf` vs a catch attempt may use the same distribution — the
spec's original design intent was about the delay being long enough to
sometimes lose the race, not about self vs. catch having different
distributions; if you want a small self/catch asymmetry that's a
reasonable judgment call, just note it in your report.) The exact
numbers aren't sacred, but easy's range must meaningfully straddle/
exceed 1000ms (so easy bots often lose races) and hard's must be
mostly under 1000ms (so hard bots usually win them) — don't collapse
all three tiers to the same narrow fast range.

**Do NOT** wire this to any human-facing UI timing (the 1s catch
stagger in `UnoTable.tsx` is a separate, already-built, human-only
concern — this reflex system is purely a host-side bot decision timer
and has no interaction with that hook beyond both racing against the
same server-side window).

## 7. Round/match transitions

`stage === 'roundOver'` → whoever (host or guest) clicks Table's
"Next round" button submits `{type:'START_NEXT_ROUND'}` (host applies
directly; guest sends the action to the host same as any other
action) — this action is intentionally not restricted to the host
(per its own validator comment: "any seated player," matching
`CALL_UNO`'s out-of-band design). `stage === 'over'` → render
`UnoResults`.

## 8. Table/Room/Results props wiring

Wire `UnoTable`'s callback props to host-apply-or-guest-send exactly
like MT's `onPlayTile`/`onDraw`. `UnoRoom`'s `onToggleHouseRule`/
`onSetDifficulty` are host-only setters that mutate the lobby state and
re-broadcast (guests never call these — the buttons are disabled for
them per spec 34f). Seat colors: extend `MT_SEAT_INKS`-style fixed
palette to 10 entries (MT's has only 8, Uno needs up to 10) — reuse
MT's 8 and add two more distinct hexes, applied the same
`seatOrder.map((id, i) => [id, palette[i]])` way.

## 9. Landing shelf

Add a Uno tile to `Landing.tsx`'s `SHELF` array (data-driven list,
`{title, note, color, onClick}` shape) — place it wherever fits the
existing designer ordering (after Chess, before Hangman is a
reasonable slot given Uno is also a newer multi-seat game, but use
your judgment on ordering and note your choice), `note: '2–10
players'`, brand color `#e11d2e`, `onClick: onPickUno`. Thread
`onPickUno` through `Landing`'s props the same way every other
`onPick*` prop is threaded from `App.tsx`.

## 10. README bump

Update the count sentence at the top of `README.md`: "Thirteen games"
→ "Fourteen games", add `**Uno**` to the bold list (before "and
**Chess**" — match whatever final ordering you used on the landing
shelf if that affects the natural list order, otherwise append it
before the closing "and X"), and extend the player-count clause to
cover Uno's 2–10 range (the sentence already calls out Farkle/Yahtzee
(8), Wahoo (2–4), and Mexican Train (2–8) individually before lumping
the rest as "two-player (for now)" — add a Uno clause the same way,
e.g. "..., Mexican Train seats 2–8, and Uno seats 2–10; the rest are
two-player (for now).").

## Verify before reporting

`npx tsc -b --noEmit` silent; `npm test` green (route.test.ts additions
must pass); `npm run build` succeeds. Report every MT site you mirrored
and where Uno's wiring genuinely differs (the variable seat count, the
house-rules/difficulty lobby state, and above all the bot Uno-call
reflex system — walk through its stale-timer-invalidation logic
explicitly in your report, don't just say "implemented per spec").
STOP and report honestly if a site doesn't map cleanly — no
improvised architecture.
