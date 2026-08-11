# Spec 24 — Landing redesign: compact scrollable shelf (design handoff)

You own EXACTLY one file: `src/screens/Landing.tsx`. Nothing else.

The designer's latest prototype reworked the main screen. Apply these
changes, matching the existing code style (inline styles, same props —
the component's props interface DOES NOT change):

1. **H1** becomes `Small games. <violet>One code.</violet>` — the
   trailing "Whoever's around." is dropped. Violet span unchanged.
2. **Name input placeholder** becomes `Ada` (was "Player One").
3. **Label row**: "On the shelf" stays 15px/600; the count sits right
   BESIDE it (`display:flex; align-items:baseline; gap:10px` — not
   space-between): 13px/500, color `var(--faint-text)`, text
   `"<n> games"` when a name is entered, else `"type a name to start one"`.
4. **Shelf becomes a compact scrollable grid**:
   `display:grid; grid-template-columns:repeat(auto-fill,minmax(150px,1fr));
   gap:8px; margin-top:12px; max-height:290px; overflow-y:auto;
   padding-right:4px`.
5. **Tiles become one-line chips** (no blurb, no stacked card): a button,
   `display:flex; align-items:center; gap:8px; width:100%;
   text-align:left; padding:10px 12px; border-radius:14px;
   border:3px solid; box-shadow:0 4px 0`, title `flex:1` 15px/700
   letter-spacing -0.01em, note (player range) 11px/500 opacity 0.8
   nowrap. Ready/disabled color scheme identical to the current tiles
   (game color + ink vs the grey set). Keep the existing hover/active
   affordances the current tiles have via the `shelf-tile` class IF that
   class's padding/size rules don't fight the new inline styles — if they
   do, introduce a `shelf-chip` class locally-styled inline instead and
   drop the old class from these buttons (do NOT edit the css file).
6. **Refactor to one data-driven list** (this replaces the five hardcoded
   tile blocks + GAMES.map): build one array of
   `{ title, note, color, onClick }` covering, IN THIS ORDER (the
   designer's, minus Chess which is deferred):
   Farkle (2–8, #6c4cff) · Yahtzee (2–8, #0fb5a0) · Tic Tac Toe (2, #ff9f1c)
   · Connect 4 (2, #2f6fed) · Battleship (2, #1a6fae) · Dominoes (2, #5b5bd6)
   · Mexican Train (4, #c2410c) · Wahoo (2–4, #9333ea) · Checkers (2, #b45309)
   · Hangman (2, #ff5d73) · Rummy (2, #1aa06d) · Phase 10 (2, #ff9f1c).
   onClick uses the existing props (onPickGame('farkle') etc. for the five
   legacy games; onPickRummy/onPickPhase10/onPickBattleship/
   onPickDominoes/onPickWahoo/onPickCheckers/onPickMexicanTrain for the
   rest). Notes are "N players"/"N–M players" as listed — keep Wahoo at
   2–4 (our implementation, not the prototype's 2–6). The count label
   derives from this array's length (12), no magic number.

## Verify before reporting

`npx tsc -b --noEmit` silent; `npm test` (772) green; `npm run build` ok.
Report the diff summary + verbatim outputs.
