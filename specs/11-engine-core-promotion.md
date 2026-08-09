# Spec 11: Promote sync/turn-engine/rng to src/engine/

You are performing a purely mechanical refactor in a React + TypeScript +
Vite repo. Every decision is already made. Do exactly what is written here —
nothing more, nothing less.

## Step 1 — move six files with `git mv`

Run, from the repo root:

```
mkdir -p src/engine
git mv src/card-engine/rng.ts src/engine/rng.ts
git mv src/card-engine/rng.test.ts src/engine/rng.test.ts
git mv src/card-engine/sync.ts src/engine/sync.ts
git mv src/card-engine/sync.test.ts src/engine/sync.test.ts
git mv src/card-engine/turn-engine.ts src/engine/turn-engine.ts
git mv src/card-engine/turn-engine.test.ts src/engine/turn-engine.test.ts
```

Do NOT edit the contents of these six files at all. Their internal relative
imports (`./sync.ts`, `./rng.ts`, `./turn-engine.ts`) remain correct because
each test moves together with its module. `git commit` is forbidden — moves
stay staged/working-tree only.

## Step 2 — update importers (exact line edits, nothing else)

Change ONLY the module path inside existing import statements. Keep the
imported names, quoting style, and presence/absence of the `.ts` extension
exactly as each line has it today.

In `src/card-engine/`:
- `bot.ts` (2 lines): `'./sync.ts'` → `'../engine/sync.ts'`
- `bot.test.ts` (2 lines): `'./sync.ts'` → `'../engine/sync.ts'`
- `deck.test.ts` (1 line): `'./rng.ts'` → `'../engine/rng.ts'`

In `src/`:
- `App.tsx`: `'./card-engine/sync'` → `'./engine/sync'`;
  `'./card-engine/turn-engine'` → `'./engine/turn-engine'`
- `net/peer.ts`: `'../card-engine/sync'` → `'../engine/sync'`
- `screens/Phase10Table.tsx`: `'../card-engine/turn-engine'` → `'../engine/turn-engine'`
- `screens/RummyTable.tsx`: `'../card-engine/turn-engine'` → `'../engine/turn-engine'`

In `src/card-games/` (8 files), replace the prefix
`'../../card-engine/` with `'../../engine/` ONLY on lines importing `sync.ts`,
`turn-engine.ts`, or `rng.ts` (lines importing `cards.ts`, `deck.ts`,
`zones.ts` must NOT change):
- `rummy/state.ts` (5 lines: turn-engine ×2, sync ×2, rng ×1 — note lines
  1–9 also import cards/zones/deck from card-engine; leave those)
- `rummy/rules.ts` (3 lines: sync ×2, turn-engine ×1)
- `rummy/bot.test.ts` (4 lines: turn-engine ×2, rng ×1, sync ×1)
- `rummy/rummy.test.ts` (5 lines)
- `phase10/state.ts` (5 lines)
- `phase10/rules.ts` (3 lines)
- `phase10/bot.test.ts` (3 lines)
- `phase10/phase10.test.ts` (4 lines)

## Step 3 — verify

Run all three; every one must be fully clean:

```
npx tsc -b --noEmit
npm test          # expect: 24 test files, 481 tests, all passing
npm run build
```

Then run:

```
grep -rn "card-engine/sync\|card-engine/turn-engine\|card-engine/rng" src
```

Expected output: nothing.

## Forbidden

- Editing any file not listed above (no docs, no CLAUDE.md, no configs).
- Creating re-export shims, index files, or barrel files.
- `git commit`, `git push`, `git add` beyond what `git mv` itself stages.
- Reformatting, renaming symbols, adding comments, "improving" anything.

## If anything fails

If any verification command fails and the fix is not an import path you
missed from the list above, STOP and report the exact failing command and its
full output. Do not improvise fixes outside this spec's file list.

## Report format

Report: (1) each command run and its actual result, verbatim tallies for the
test run; (2) the full list of files you changed; (3) anything that deviated
from this spec, or "no deviations".
