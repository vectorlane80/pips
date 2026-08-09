# Spec 12: Promote bot.ts to src/engine/

Purely mechanical refactor, all decisions made. Do exactly this.

## Step 1 — move two files

From the repo root:

```
git mv src/card-engine/bot.ts src/engine/bot.ts
git mv src/card-engine/bot.test.ts src/engine/bot.test.ts
```

## Step 2 — exact import edits

In the two moved files (their sync import is now a sibling):
- `src/engine/bot.ts` (2 lines): `'../engine/sync.ts'` → `'./sync.ts'`
- `src/engine/bot.test.ts` (2 lines): `'../engine/sync.ts'` → `'./sync.ts'`

In `src/card-games/` (6 lines total, path swap only, keep imported names
and style exactly):
- `rummy/bot.ts` line 1: `'../../card-engine/bot.ts'` → `'../../engine/bot.ts'`
- `rummy/rules.ts` line 4: same swap
- `rummy/rummy.test.ts` line 12: same swap
- `phase10/bot.ts` line 1: same swap
- `phase10/rules.ts` line 3: same swap
- `phase10/phase10.test.ts` line 10: same swap

## Step 3 — verify (all must be fully clean)

```
npx tsc -b --noEmit
npm test          # expect 24 files, 481 tests, all passing
npm run build
grep -rn "card-engine/bot" src   # expect zero matches
```

## Forbidden

Editing any other file (including CLAUDE.md, docs, configs); shims/barrels;
`git commit`/`git push`/`git add` beyond what `git mv` stages; any content
change beyond the listed import lines.

## If anything fails

If a failure isn't a missed import path from the list above, STOP and report
the failing command + full output verbatim.

## Report format

(1) commands run with actual results (verbatim test tallies); (2) files
changed; (3) deviations or "no deviations".
