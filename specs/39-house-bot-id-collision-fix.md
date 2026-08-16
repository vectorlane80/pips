# Spec 39 — fix house-bot ID collision across N-seat lobby games

Fixes a real, confirmed bug flagged during the Rummy+Phase10 N-player
charter (see `docs/DEVLOG.md` Cycle 15, `ROADMAP.md`): 5 games'
`addXHouseBot()` functions in `src/App.tsx` generate a new bot's
`playerId` as `` `bot-${seats.length}` `` — an index derived from the
CURRENT seats array length. Because a pre-start guest leave compacts
the seats array via `.filter((s) => s.playerId !== guestId)`, a later
add-bot call can regenerate an already-used index and produce a
**duplicate `playerId`**. A duplicate `playerId` seated twice corrupts
every `Record<string, ...>` the engine keys by player (hands, scores,
`handCounts`) and corrupts `seatOrder` itself.

**Confirmed reproduction** (traced by hand, Phase 10, identical
mechanism in the other 4 games): `[host]` → add bot → `bot-1`, seats =
`[host, bot-1]` (len 2) → guest joins → seats = `[host, bot-1, guest]`
(len 3) → add bot → `bot-3` → guest leaves pre-start → filter compacts
to `[host, bot-1, bot-3]` (len 3) → add bot again → len is still 3 →
generates `bot-3` again, colliding with the existing seat.

**Affected games** (confirmed via direct grep — these 5 use the
repeatable, N-seat, index-derived scheme with array-compacting leave
handling): Rummy (`addRummyHouseBot`), Phase 10
(`addPhase10HouseBot`), Wahoo (`addWahooHouseBot`), Mexican Train
(`addMTHouseBot`), Uno (`addUnoHouseBot`).

**NOT affected, do not touch**: Battleship, Dominoes, Checkers, Chess.
Their `addXHouseBot()` functions use a single hardcoded `botId = 'bot'`
— always exactly one bot, no repeatable add, no seat-array compaction
race. Confirmed by reading all 9 `addXHouseBot` functions before
writing this spec; these 4 have no bug to fix.

You own edits to exactly one file: `src/App.tsx`. Do not touch any
other file — this is a pure bug fix, not a feature, and needs no
screen/wiring/engine changes anywhere.

## The fix — decided, apply identically to all 5 games

Replace the `` `bot-${seats.length}` `` derivation with a
**monotonically increasing per-room counter that never resets or
reuses a value for the lifetime of a hosted room**, even across guest
leaves. This guarantees a fresh, never-before-used ID on every call
regardless of how many times the seats array has been compacted.

For each of the 5 games, in the same style as the existing
`XBotSeatsRef = useRef<Set<string>>(new Set())` refs already declared
near the top of the component:

1. Add one new ref: `const xBotCounterRef = useRef(0)` (substitute
   each game's own prefix — `rummyBotCounterRef`, `phase10BotCounterRef`,
   `wahooBotCounterRef`, `mtBotCounterRef`, `unoBotCounterRef`). Place
   it directly next to that game's existing `xBotSeatsRef` declaration.
2. In `addXHouseBot()`, replace:
   ```ts
   const botId = `bot-${xSeatsRef.current.length}`
   ```
   with:
   ```ts
   xBotCounterRef.current += 1
   const botId = `bot-${xBotCounterRef.current}`
   ```
3. Reset `xBotCounterRef.current = 0` at every point that already
   resets that game's `xSeatsRef.current = []` / `xBotSeatsRef.current.clear()`
   pair (room creation via `startXHost()`, and the global reset-to-entry
   cleanup). Find these by grepping for `xBotSeatsRef.current.clear()` —
   every call site of that line gets the new counter reset added next
   to it. This is a per-room counter: a new hosted room legitimately
   starts back at `bot-1`, but within one room's lifetime the same
   numeric suffix must never be issued twice.

Do NOT use `crypto.randomUUID()` or any other randomized scheme —
a monotonic counter is simpler, deterministic (easier to reason about
and to test), and the spec's job here is the minimum fix that closes
the actual collision mechanism, not a bigger rewrite.

Do NOT change `xBotSeatsRef` (the `Set<string>` tracking which seated
playerIds are bots) — that data structure is unrelated to ID
*generation* and needs no change.

Do NOT change `randomBotName()` or any bot-naming logic — this spec is
about `playerId` collisions only, names were never the problem.

## Verify before reporting

For EACH of the 5 games, by hand-reasoning or a quick manual trace
(no new automated test files are required — this is `App.tsx`
wiring, which this codebase does not unit-test, matching the
established convention from specs 36/38):
- Confirm the exact collision scenario described above (add bot →
  guest joins → add bot → guest leaves → add bot) now produces 3
  DISTINCT bot IDs, not a repeat.
- Confirm a fresh room (new `startXHost()` call) starts its counter
  back at `bot-1`, not continuing from a previous room's count — the
  counter must live in a ref that gets reset with that game's other
  per-room state, not a module-level global.
- Confirm the seat cap (`XX_MAX_SEATS`) and `xBotSeatsRef` bot-tracking
  behavior are otherwise completely unchanged — this is a pure ID-
  generation fix, no other lobby behavior should differ.

Run `npx tsc -b --noEmit`, `npm test -- --run`, `npm run build`
yourself and paste the actual output — expect all three to pass with
**zero test count change** (962 baseline; this fix touches no engine
or test file). Report back a summary, confirmation of all three
verification commands, and the exact diff for one representative game
(pick Rummy or Phase10) so the fix can be spot-checked against the
other 4 for consistency.
