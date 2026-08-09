# Charter: Engine-core promotion (src/engine/)

**Mode:** directed
**Started:** 2026-08-09
**Pre-approved:** yes — the lead investigated the grid/path-game abstraction
question, recommended (option 1) promoting the game-agnostic modules out of
`src/card-engine/`, and the user replied "Do number 1. Use /autonomous-dev-loop
and /model-routing — but don't use codex at all." That reply is the charter
approval; scope is exactly recommendation 1.

**Delegation:** per `/model-routing`, with Codex excluded by user order.
Implementation (mechanical refactor) → `deepseek:flash` (live-probed OK at
charter start); adversarial review → `claude --model sonnet --effort medium`;
spec authoring + loop driving + verification + docs → this session (session
model is Fable, the designated spec-author tier — no external call needed).

**Working branch:** `main`, per this repo's established pattern. No
`git commit` / `git push` by the loop (project CLAUDE.md); the slice lands
verified in the working tree, commit deferred to user authorization at
wrap-up. Single-cycle run, lead present — the hourly safety-net scheduler is
deliberately skipped (it exists to revive long unattended runs; here it would
only risk an orphaned cron).

## Scope (locked)

Move the three game-agnostic modules — `sync.ts`, `turn-engine.ts`, `rng.ts`,
each with its test file — from `src/card-engine/` to a new `src/engine/`
directory, verbatim (no behavior change, no API change). Update every
importer. No re-export shims. `git mv` so history survives the eventual
commit.

Rationale (from the investigation): these three modules contain no card
knowledge and are exactly what Battleship (hidden per-player boards =
`HostSession` private state) and Wahoo (seeded RNG, turn engine with
extra-turn) need. Promoting them makes the shared core real without building
a speculative grid/path engine.

## Non-goals
- **No grid engine, no path engine.** Per the investigation: grid games share
  ~10 lines of index math; abstract only when a second game of a family
  exists.
- **`bot.ts` stays in `src/card-engine/`.** It is also generic (imports only
  sync), but the approved scope named exactly three modules. Candidate for a
  later promotion — noted in REQUESTS.md.
- **No edits to `CLAUDE.md`** (user-owned). Its card-engine import
  constraints implicitly extend to `src/engine/`; flagged in REQUESTS.md for
  the user to codify if desired.
- No Battleship work, no behavior changes, no drive-by refactors.

## Milestones
- M1: files moved, all importers updated, `npx tsc -b --noEmit` + `npm test`
  (481) + `npm run build` clean, review clean, docs
  (`docs/card-engine.md`, `README.md`) updated to the new layout.

## Definition of done
- `src/engine/` holds sync/turn-engine/rng (+tests); `src/card-engine/` holds
  only card-specific modules (cards, deck, zones, bot) importing from
  `../engine/`.
- Zero references to the old paths anywhere in `src/`.
- Typecheck, 481 tests, and build all green, re-run by the lead.
- Working tree left uncommitted-but-staged-clean for user commit.

## Run budget
2 cycles (expect 1). Stop when the definition of done is met.
