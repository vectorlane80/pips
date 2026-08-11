# Charter: Chess (from chess-plan.md + CHECKERS-CHESS.md, 2026-08-11)

Full-rules chess on the engine pattern, three bot tiers. The handoff plan's
architecture is adopted with two lead amendments: build on `src/board-games/`
+ HostSession (not the legacy `src/games/`/room.ts the plan assumed), and
reuse the now-wired `checker-jump`/`king-me` sounds directly.

User sign-offs (2026-08-11): chess.js runtime dep approved; 3-tier
difficulty selector approved (Battleship variant-picker precedent);
Stockfish WASM Hard tier approved as a follow-up milestone.

## M1 — Chess module (`src/board-games/chess/`)
- `chess.js` (new runtime dep) owns legality: check-aware generation,
  castling, en passant, promotion, mate/stalemate, threefold/50-move.
- Public state is plain data: current FEN string (wire-safe), move list in
  SAN or {from,to,promotion}, stage ('play'|'over'), outcome
  (white/black/draw + reason), turn via TurnState, seatOrder (seat 0 =
  white = host side per CHECKERS-CHESS.md pattern), drawOffer state,
  difficulty ('easy'|'normal'|'hard').
- Actions: MOVE {from,to,promotion?}, RESIGN, OFFER_DRAW, ACCEPT_DRAW,
  DECLINE_DRAW. Host validator reconstructs Chess(fen) per action. Single
  game per match (no best-of), REMATCH via the shared results flow.
- Bots: easy = weighted-random legal (captures lightly preferred);
  normal = depth-2 material minimax (per handoff). Both synchronous
  BotStrategy. Tests: wrapper behavior (promotion flow, castling and en
  passant round-trip through our action layer, draw offers gated to the
  offerer's turn, resign, outcome mapping, wire safety, bot legality) —
  chess.js's own correctness is not re-tested.

## M2 — Screens + wiring
- ChessRoom (2 seats + host difficulty picker, Battleship-variant style),
  ChessTable (board ≤640px, explicit grid rows/cols, colored token circles
  with white glyphs — never bare unicode on squares — selection/target
  rings, promotion choice bar, "Check!" status, resign + offer-draw
  buttons on your turn), ChessResults (Won/Lost/½ — no numeric score),
  ChessRulesOverlay. CSS per sibling conventions. Brand `#0891b2`.
- Sounds: piece-drop (move/castle), checker-jump (capture — ear-check),
  king-me (promotion), error (illegal input); no check sound; results
  plays game-win as usual.
- Wiring: CH- prefix, route segment `chess`, landing chip after Checkers
  ("Full rules, castling and all" / "2 players" / #0891b2, count → 13),
  README. Bot loop: easy/normal via runBotTurn synchronous pattern.

## M3 — Hard tier (follow-up, lands after M1+M2 are live)
- Single-threaded Stockfish WASM under `public/engines/stockfish/`
  (GH Pages: no COOP/COEP, so no SharedArrayBuffer builds), lazy-loaded
  only when a table selects Hard. Worker per table; UCI_LimitStrength +
  UCI_Elo ~2000; movetime capped 1–2s.
- Hard bypasses runBotTurn: Chess-local async glue posts position/go,
  awaits bestmove, applies via applyAction. Engine core untouched.
- Tests: message-contract against a mocked worker; no real WASM in CI.

## Non-goals
Spectators; clocks/time controls; PGN export; opening books; multiplayer
draw-offer chat. Wahoo 2–6 (separate charter).

## Definition of done
Live vs bot on all three tiers (M3 for hard): a full game with castling,
an en-passant capture, a promotion, a check, and each outcome type
(mate/stalemate via constructed positions in tests; resign + draw live);
Oscar module/wiring reviews + visual review; tsc/tests/build green; docs.

## Budget / routing
Directed: expect ~5–7 cycles, cap 25. deepseek flash implements, Oscar on
sonnet reviews, never Codex. Any milestone stuck 3 cycles → re-scope.
