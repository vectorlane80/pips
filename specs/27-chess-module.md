# Spec 27 — Chess module (state, rules, bots, tests)

You own EXACTLY these files — create the directory:

- `src/board-games/chess/state.ts`
- `src/board-games/chess/rules.ts`
- `src/board-games/chess/bot.ts`
- `src/board-games/chess/chess.test.ts`
- `package.json` — ONE line: add `"chess.js": "^1.x"` (latest stable) to
  `dependencies`. Do not touch any other line. Run `npm install` after.

No React. Import from `src/engine/`, `chess.js`, and within the folder
only. Match `src/board-games/checkers/` in style (plain functions, no
classes, explicit types). All state must be plain serializable data —
chess.js's `Chess` INSTANCE never crosses the wire; only its FEN string
does. `assertWireSafe` must pass on every publicState.

## state.ts

```ts
import { Chess } from 'chess.js'
import type { HostSession } from '../../engine/sync.ts'
import { createHostSession } from '../../engine/sync.ts'
import type { TurnState } from '../../engine/turn-engine.ts'
import { createTurnState } from '../../engine/turn-engine.ts'
import { createRng } from '../../engine/rng.ts'

export type ChessStage = 'play' | 'over'
export type ChessDifficulty = 'easy' | 'normal' | 'hard'
export type ChessOutcome =
  | { kind: 'checkmate'; winnerSeat: 0 | 1 }
  | { kind: 'resign'; winnerSeat: 0 | 1 }
  | { kind: 'stalemate' }
  | { kind: 'draw'; reason: 'agreement' | 'threefold' | 'fifty-move' | 'insufficient-material' }

export interface LastChessMove {
  by: string
  san: string          // algebraic notation of the move just made, for the status line
  check: boolean        // does this move give check?
}

export interface ChessPublicState {
  stage: ChessStage
  turn: TurnState<'play'>
  seatOrder: [string, string]     // index 0 = white, index 1 = black
  fen: string                     // current position — the ONLY board truth on the wire
  difficulty: ChessDifficulty
  drawOfferBy: string | null      // seated id of whoever has a pending draw offer out
  outcome: ChessOutcome | null    // set only when stage === 'over'
  lastMove: LastChessMove | null
}

export type ChessPrivateState = Record<string, never>   // perfect information

export type ChessAction =
  | { type: 'MOVE'; from: string; to: string; promotion?: 'q' | 'r' | 'b' | 'n' }
  | { type: 'RESIGN' }
  | { type: 'OFFER_DRAW' }
  | { type: 'ACCEPT_DRAW' }
  | { type: 'DECLINE_DRAW' }

export interface ChessSession {
  session: HostSession<ChessPublicState, ChessPrivateState>
  rng: () => number   // for the easy bot's weighted-random pick
}
```

Functions:
- `createChessGame(playerIds: [string, string], difficulty: ChessDifficulty, seed: number): ChessSession`
  — `new Chess()` default start position, `fen()` into publicState, turn =
  `createTurnState(playerIds, 'play')` (white/seat 0 starts — chess.js's
  own turn tracking is redundant with ours; ignore its `.turn()` for game
  flow, trust our TurnState, but DO pass the position through chess.js for
  legality on every action).
- `seatToColor(seat: 0 | 1): 'w' | 'b'`.
- `outcomeFromChessJs(chess: Chess, moverSeat: 0 | 1): ChessOutcome | null`
  — after applying a move, if `chess.isCheckmate()` → `{kind:'checkmate', winnerSeat: moverSeat}`;
  else if `chess.isStalemate()` → `{kind:'stalemate'}`; else if
  `chess.isThreefoldRepetition()` → draw/threefold; else if
  `chess.isDraw()` (fifty-move or insufficient material — chess.js
  doesn't disambiguate cleanly, so: check `chess.isInsufficientMaterial()`
  first for that specific reason, else fall back to 'fifty-move'); else
  null (game continues).

## rules.ts

`validateChessAction` + `applyChessAction`, mirroring checkers/rules.ts's
shape.

### MOVE
Reject unless: stage 'play'; playerId is `currentPlayer(turn)`;
reconstruct `new Chess(publicState.fen)`; call `chess.move({from, to,
promotion})` in a try/catch (chess.js throws on illegal input in strict
mode, or returns null depending on version — handle both: reject with
'illegal move' on throw or null return). On success: new fen =
`chess.fen()`; outcome = `outcomeFromChessJs(chess, moverSeat)`; if
outcome set → stage 'over', else `turn = advanceTurn(turn, 'play')` and
stage stays 'play'; `lastMove = { by: playerId, san: result.san, check:
chess.inCheck() }`; `drawOfferBy` always clears on any MOVE (moving
implicitly declines a pending offer — do not require an explicit
DECLINE_DRAW first).

### RESIGN
Reject unless stage 'play' and playerId is one of seatOrder. Apply:
outcome `{kind:'resign', winnerSeat: <the OTHER seat>}`, stage 'over'.

### OFFER_DRAW
Reject unless stage 'play', playerId is `currentPlayer(turn)` (only offer
on your own turn — mirrors the handoff's "house only accepts when not
materially ahead" being an on-turn courtesy), `drawOfferBy === null`.
Apply: `drawOfferBy = playerId`. Turn/stage unchanged.

### ACCEPT_DRAW
Reject unless stage 'play', `drawOfferBy !== null`, playerId !==
drawOfferBy (you can't accept your own offer). Apply: outcome
`{kind:'draw', reason:'agreement'}`, stage 'over'.

### DECLINE_DRAW
Reject unless `drawOfferBy !== null`, playerId !== drawOfferBy. Apply:
`drawOfferBy = null`. Turn/stage unchanged. (Note MOVE also implicitly
declines — this action exists for a player who wants to decline without
moving yet.)

## bot.ts

Two `BotStrategy` factories:

- `makeEasyChessBotStrategy(rng): BotStrategy<...>` — reconstruct
  `new Chess(publicState.fen)`, get `chess.moves({verbose:true})`, weight
  captures 3x over non-captures in the random pick (build a weighted pool,
  pick via rng), return `{type:'MOVE', from, to, promotion: m.promotion}`
  (include promotion only when the move object has one — always promote
  to queen for the bot).
- `makeNormalChessBotStrategy(): BotStrategy<...>` — depth-2 material
  minimax per CHECKERS-CHESS.md: for each legal move, assume the opponent
  replies with whichever legal reply maximizes THEIR material next (score
  a position by standard piece values, no positional weighting), pick the
  move minimizing that worst-case reply. Use `chess.js`'s
  `moves({verbose:true})` + `move()`/`undo()` for the 2-ply search (no
  external eval library). On a tie, first move in iteration order (no rng
  needed — keep it deterministic and simple, matching the handoff's
  description).

Both never propose RESIGN/OFFER_DRAW/etc — MOVE only, always legal (never
called except when it's the bot's turn in stage 'play').

## chess.test.ts (vitest, ≥ 30 tests)

Cover: game creation (start FEN, seat 0 = white to move); a plain move
accepted and advances the turn; illegal move rejected (both a
geometrically-impossible move and a pseudo-legal-but-check-exposing
move); out-of-turn rejected; castling (kingside and queenside) round-trips
through MOVE and updates the FEN's castling rights; en passant (construct
the double-step setup, capture, verify the passed pawn is removed);
promotion (pawn reaches the last rank, `promotion:'q'` required, produces
a queen on the board — verify via FEN); checkmate ends the game with the
correct winnerSeat (use a known fast mate, e.g. Fool's Mate moves);
stalemate ends the game with no winner (construct or find a known
stalemate FEN and verify via a constructed position, not necessarily
played from the start); resign sets outcome + stage; draw offer/accept
round-trip (offer, other player accepts, stage over, reason 'agreement');
draw offer declined explicitly and implicitly (a MOVE after an offer
clears drawOfferBy without accepting); offering a draw out of turn or
accepting your own offer rejected; wire safety (assertWireSafe + JSON
round-trip on a mid-game state, confirming fen is a plain string and no
Chess instance ever leaks onto publicState); easy bot always returns a
legal move across several seeded rng values, and empirically prefers
captures more often than not when both exist (a probabilistic check over
many trials is fine, or a constructed position with exactly one capture
among several moves, run N times, capture chosen more than baseline);
normal bot picks the documented minimizing-worst-case move on a small
constructed position where the right answer is unambiguous (e.g. a
position with one move that hangs a piece vs one that doesn't).

## Verify before reporting

`npm install` succeeded (chess.js in node_modules); `npx tsc -b --noEmit`
silent; `npm test` all green (778 currently, yours adds to that). Report
files, test count, verbatim final command outputs. If chess.js's actual
API differs from what's assumed above (method names, promotion move
shape, draw-detection method names), adapt to the REAL API and note the
deviation — don't invent methods that don't exist. If anything is red or
you cannot finish, say so plainly.
