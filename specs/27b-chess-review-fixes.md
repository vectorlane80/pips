# Spec 27b — Chess module: review fixes

Oscar's adversarial review found two real bugs and one consistency nit in
the chess module. You own EXACTLY:

- `src/board-games/chess/bot.ts`
- `src/board-games/chess/rules.ts`
- `src/board-games/chess/chess.test.ts` (add regression tests for all three)

## Fix 1 — normal bot walks into stalemate (major)

Live repro Oscar confirmed: white K+R vs lone black K (`8/8/8/8/R7/K7/8/k7 w - - 0 1`,
completely winning), and `makeNormalChessBotStrategy()` picks a move that
STALEMATES black — throwing away a win for a draw — because the search
scores "opponent has zero replies" as `-Infinity` (best possible outcome
for the bot) whether that's checkmate OR stalemate.

Fix: after the bot's candidate move, if the resulting position has zero
legal replies for the opponent, distinguish the two cases explicitly —
checkmate is the best possible outcome (keep scoring it as such, e.g. a
very large positive number so it's always preferred), stalemate is a draw
and must NOT score better than a real material-winning continuation (score
it as 0 / neutral, not as better than everything else). Do this by
checking `chess.isCheckmate()` vs `chess.isStalemate()` on the position
after the bot's own candidate move, before falling into the worst-reply
material search.

Add a regression test using Oscar's exact repro: from
`8/8/8/8/R7/K7/8/k7 w - - 0 1`, assert the bot's chosen move does NOT
result in `chess.isStalemate() === true` on the resulting position.

## Fix 2 — drawOfferBy not cleared on RESIGN / ACCEPT_DRAW (major)

Live repro: OFFER_DRAW by p1, then RESIGN by p2. Result: stage 'over',
outcome resign, but `drawOfferBy` is STILL `'p1'`. A follow-up
DECLINE_DRAW from p2 is then wrongly accepted (`ok: true`) on an
already-finished game, because DECLINE_DRAW has no stage gate.

Fix, both parts:
1. In RESIGN's and ACCEPT_DRAW's success branches, set
   `drawOfferBy: null` in the returned publicState (matching what MOVE
   already does).
2. Add a `publicState.stage !== 'play'` rejection to ACCEPT_DRAW and
   DECLINE_DRAW (reason: `'not in play stage'`, matching MOVE/OFFER_DRAW's
   existing wording) — belt and suspenders with fix 2.1, and closes the
   door on any other stage-over draw-response race.

Add regression tests: RESIGN after a pending OFFER_DRAW clears
`drawOfferBy`; ACCEPT_DRAW after a pending offer clears it (in addition to
setting stage/outcome, which is already tested); ACCEPT_DRAW and
DECLINE_DRAW both rejected once stage is 'over' (construct a finished game
via RESIGN or checkmate, then attempt each).

## Fix 3 — ACCEPT_DRAW/DECLINE_DRAW missing seatOrder membership check (nit, do it for consistency)

Every other non-turn-gated action in this codebase (checkers' NEXT_GAME,
this module's own RESIGN) checks the caller is actually a seated player.
ACCEPT_DRAW/DECLINE_DRAW only check `playerId !== drawOfferBy`, which
would let an unseated id "accept" or "decline" if it ever reached the
validator with a spoofed but non-drawOfferBy id. Add
`if (!publicState.seatOrder.includes(playerId)) return { ok: false, reason: 'not a seated player' }`
to both, in the same position RESIGN's check sits (before the
already-own-offer check). Add one test per action confirming an unseated
id is rejected.

## Verify before reporting

`npx tsc -b --noEmit` silent; `npm test` all green (814 currently — you're
adding tests, not removing any). Do not weaken any existing assertion to
make this pass. Report the diff for each fix, the new test count, and
verbatim final command outputs.
