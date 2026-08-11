import { describe, expect, it } from 'vitest'
import { applyChessAction, runChessBotTurn, validateChessAction } from './rules.ts'
import { makeEasyChessBotStrategy, makeNormalChessBotStrategy } from './bot.ts'
import {
  createChessGame,
  outcomeFromChessJs,
  seatToColor,
  type ChessAction,
  type ChessPrivateState,
  type ChessPublicState,
} from './state.ts'
import { createRng } from '../../engine/rng.ts'
import { assertWireSafe, createHostSession, isJsonSerializable } from '../../engine/sync.ts'
import { currentPlayer } from '../../engine/turn-engine.ts'
import { Chess } from 'chess.js'

// p1 = seat 0 (white), p2 = seat 1 (black); white starts.
function buildGame(
  fen: string,
  turnIndex = 0,
  stage: ChessPublicState['stage'] = 'play',
): ReturnType<typeof createChessGame> {
  const playerOrder: [string, string] = ['p1', 'p2']
  const publicState: ChessPublicState = {
    stage,
    turn: { playerOrder, currentIndex: turnIndex, direction: 1, phase: 'play', turnNumber: 1 },
    seatOrder: playerOrder,
    fen,
    difficulty: 'normal',
    drawOfferBy: null,
    outcome: null,
    lastMove: null,
  }
  const privateStates: Record<string, ChessPrivateState> = { p1: {}, p2: {} }
  return { session: createHostSession(publicState, privateStates), rng: createRng(0) }
}

// Moves played alternately from the start position, e.g. playMoves('e2e4', 'e7e5').
// The built state mirrors the resulting position: whose turn it is (FEN side to
// move) and whether the game is already over (checkmate/stalemate/draw).
function playMoves(...lans: string[]): ReturnType<typeof createChessGame> {
  const chess = new Chess()
  for (const lan of lans) chess.move(lan)
  return buildGame(
    chess.fen(),
    chess.turn() === 'b' ? 1 : 0,
    chess.isGameOver() ? 'over' : 'play',
  )
}

describe('game creation', () => {
  it('createChessGame starts at the standard FEN with white to move', () => {
    const game = createChessGame(['p1', 'p2'], 'normal', 1)
    expect(game.session.publicState.fen).toBe(
      'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    )
    expect(game.session.publicState.stage).toBe('play')
    expect(game.session.publicState.outcome).toBeNull()
    expect(game.session.publicState.drawOfferBy).toBeNull()
    expect(game.session.publicState.lastMove).toBeNull()
    expect(game.session.publicState.difficulty).toBe('normal')
    expect(currentPlayer(game.session.publicState.turn)).toBe('p1')
    expect(game.session.publicState.seatOrder).toEqual(['p1', 'p2'])
    expect(seatToColor(0)).toBe('w')
    expect(seatToColor(1)).toBe('b')
  })

  it('private states are empty objects and the session carries an rng', () => {
    const game = createChessGame(['p1', 'p2'], 'easy', 7)
    expect(game.session.privateStates).toEqual({ p1: {}, p2: {} })
    expect(typeof game.rng).toBe('function')
  })
})

describe('MOVE validation', () => {
  it('a plain move is accepted, advances the turn, and records lastMove', () => {
    const game = createChessGame(['p1', 'p2'], 'normal', 1)
    const r = applyChessAction(game, 'p1', { type: 'MOVE', from: 'e2', to: 'e4' })
    expect(r.outcome.ok).toBe(true)
    const pub = r.game.session.publicState
    expect(pub.fen).toBe('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1')
    expect(currentPlayer(pub.turn)).toBe('p2')
    expect(pub.turn.turnNumber).toBe(2)
    expect(pub.stage).toBe('play')
    expect(pub.outcome).toBeNull()
    expect(pub.lastMove).toEqual({ by: 'p1', san: 'e4', check: false })
  })

  it('the black player answers from the black side after white moves', () => {
    const game = createChessGame(['p1', 'p2'], 'normal', 1)
    const r1 = applyChessAction(game, 'p1', { type: 'MOVE', from: 'e2', to: 'e4' })
    const r2 = applyChessAction(r1.game, 'p2', { type: 'MOVE', from: 'e7', to: 'e5' })
    expect(r2.outcome.ok).toBe(true)
    expect(currentPlayer(r2.game.session.publicState.turn)).toBe('p1')
    expect(r2.game.session.publicState.lastMove).toEqual({ by: 'p2', san: 'e5', check: false })
  })

  it('rejects a geometrically impossible move', () => {
    const game = createChessGame(['p1', 'p2'], 'normal', 1)
    const r = applyChessAction(game, 'p1', { type: 'MOVE', from: 'e2', to: 'e5' })
    expect(r.outcome.ok).toBe(false)
    expect(r.outcome.reason).toContain('illegal move')
    expect(r.game.session.publicState.fen).toBe(
      'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    )
  })

  it('rejects a pseudo-legal move that exposes the king to check', () => {
    // White Ke1 + Ne2, black Ke8 + Re8: Nd4 / Nc3 / Nf4 all hang the e-file.
    const game = buildGame('4r1k1/8/8/8/8/8/4N3/4K3 w - - 0 1')
    const r = applyChessAction(game, 'p1', { type: 'MOVE', from: 'e2', to: 'c3' })
    expect(r.outcome.ok).toBe(false)
    expect(r.outcome.reason).toContain('illegal move')
  })

  it('rejects an out-of-turn MOVE', () => {
    const game = createChessGame(['p1', 'p2'], 'normal', 1)
    const r = applyChessAction(game, 'p2', { type: 'MOVE', from: 'e7', to: 'e5' })
    expect(r.outcome.ok).toBe(false)
    expect(r.outcome.reason).toContain('turn')
  })

  it('rejects a MOVE after the game is over', () => {
    const game = playMoves('f2f3', 'e7e5', 'g2g4', 'd8h4') // Fool's Mate, game over
    // p1 is the current player after the mate (white to move, but the game is over)
    const r = applyChessAction(game, 'p1', { type: 'MOVE', from: 'e2', to: 'e4' })
    expect(r.outcome.ok).toBe(false)
    expect(r.outcome.reason).toContain('play stage')
  })

  it('the validator rejects an unknown action type', () => {
    const game = createChessGame(['p1', 'p2'], 'normal', 1)
    const result = validateChessAction(game.session, 'p1', { type: 'BOGUS' } as unknown as ChessAction)
    expect(result.ok).toBe(false)
    expect(result.reason).toContain('unknown action')
  })
})

describe('castling', () => {
  it('kingside castling round-trips through MOVE and updates the FEN', () => {
    const game = playMoves('e2e4', 'e7e5', 'g1f3', 'g8f6', 'f1e2', 'f8e7')
    const before = game.session.publicState.fen
    expect(before).toContain('KQkq')
    const r = applyChessAction(game, 'p1', { type: 'MOVE', from: 'e1', to: 'g1' })
    expect(r.outcome.ok).toBe(true)
    const after = r.game.session.publicState.fen
    // The king moving consumes BOTH white rights; black's are untouched.
    expect(after.split(' ')[2]).toBe('kq')
    expect(after.split(' ')[0]).toContain('1RK1') // king on g1, rook on f1
    expect(r.game.session.publicState.lastMove).toEqual({ by: 'p1', san: 'O-O', check: false })
    expect(currentPlayer(r.game.session.publicState.turn)).toBe('p2')
  })

  it('queenside castling round-trips through MOVE and updates the FEN', () => {
    const game = playMoves('e2e4', 'e7e5', 'd2d4', 'd7d6', 'b1c3', 'b8c6', 'c1g5', 'f8e7', 'd1d2', 'g8f6')
    const r = applyChessAction(game, 'p1', { type: 'MOVE', from: 'e1', to: 'c1' })
    expect(r.outcome.ok).toBe(true)
    const after = r.game.session.publicState.fen
    // The king moving consumes BOTH white rights; black's are untouched.
    expect(after.split(' ')[2]).toBe('kq')
    expect(after.split(' ')[0]).toContain('2KR') // king on c1, rook on d1
    expect(r.game.session.publicState.lastMove).toEqual({ by: 'p1', san: 'O-O-O', check: false })
  })
})

describe('en passant', () => {
  it('a double-step setup allows en passant capture and removes the passed pawn', () => {
    // 1.e4 a6 2.e5 d5 — black's double step lands beside the white e5 pawn.
    const game = playMoves('e2e4', 'a7a6', 'e4e5', 'd7d5')
    expect(game.session.publicState.fen).toContain('d6') // en passant target square
    const r = applyChessAction(game, 'p1', { type: 'MOVE', from: 'e5', to: 'd6' })
    expect(r.outcome.ok).toBe(true)
    const after = r.game.session.publicState.fen
    // exd6 removes the passed black d-pawn and leaves the white pawn on d6;
    // the other black pawns (a6, b7, c7, e7, f7, g7, h7) remain.
    expect(after.split(' ')[0]).toBe('rnbqkbnr/1pp1pppp/p2P4/8/8/8/PPPP1PPP/RNBQKBNR')
    expect(r.game.session.publicState.lastMove).toEqual({ by: 'p1', san: 'exd6', check: false })
  })
})

describe('promotion', () => {
  it('a pawn reaching the last rank requires an explicit promotion and produces a queen', () => {
    // White pawn on a7, black king on h7: white's only useful moves are a8 promotions.
    const game = buildGame('8/P6k/8/8/8/8/8/7K w - - 0 1')
    const noPromo = applyChessAction(game, 'p1', { type: 'MOVE', from: 'a7', to: 'a8' })
    expect(noPromo.outcome.ok).toBe(false)
    expect(noPromo.outcome.reason).toContain('illegal move')

    const r = applyChessAction(game, 'p1', { type: 'MOVE', from: 'a7', to: 'a8', promotion: 'q' })
    expect(r.outcome.ok).toBe(true)
    expect(r.game.session.publicState.fen.split(' ')[0]).toBe('Q7/7k/8/8/8/8/8/7K')
    expect(r.game.session.publicState.lastMove).toEqual({ by: 'p1', san: 'a8=Q', check: false })
  })

  it('an invalid promotion piece is rejected', () => {
    const game = buildGame('8/P6k/8/8/8/8/8/7K w - - 0 1')
    const r = applyChessAction(game, 'p1', {
      type: 'MOVE',
      from: 'a7',
      to: 'a8',
      promotion: 'x' as never,
    })
    expect(r.outcome.ok).toBe(false)
  })
})

describe('game end', () => {
  it('Fool\u2019s Mate ends the game in checkmate with winnerSeat 1', () => {
    let game = createChessGame(['p1', 'p2'], 'normal', 1)
    const moves: ChessAction[] = [
      { type: 'MOVE', from: 'f2', to: 'f3' },
      { type: 'MOVE', from: 'e7', to: 'e5' },
      { type: 'MOVE', from: 'g2', to: 'g4' },
      { type: 'MOVE', from: 'd8', to: 'h4' },
    ]
    for (const m of moves) {
      const player = currentPlayer(game.session.publicState.turn)
      const r = applyChessAction(game, player, m)
      expect(r.outcome.ok).toBe(true)
      game = r.game
    }
    const pub = game.session.publicState
    expect(pub.stage).toBe('over')
    expect(pub.outcome).toEqual({ kind: 'checkmate', winnerSeat: 1 })
    expect(pub.lastMove).toEqual({ by: 'p2', san: 'Qh4#', check: true })
  })

  it('stalemate ends the game with no winner', () => {
    // White Qf6→f7 boxes the black king in: stalemate.
    const game = buildGame('7k/8/5QK1/8/8/8/8/8 w - - 0 1')
    const r = applyChessAction(game, 'p1', { type: 'MOVE', from: 'f6', to: 'f7' })
    expect(r.outcome.ok).toBe(true)
    const pub = r.game.session.publicState
    expect(pub.stage).toBe('over')
    expect(pub.outcome).toEqual({ kind: 'stalemate' })
    expect(pub.lastMove).toEqual({ by: 'p1', san: 'Qf7', check: false })
    expect(currentPlayer(pub.turn)).toBe('p1') // turn untouched when the game ends
  })

  it('resign sets the outcome with the other seat as winner', () => {
    const game = createChessGame(['p1', 'p2'], 'normal', 1)
    const r = applyChessAction(game, 'p1', { type: 'RESIGN' })
    expect(r.outcome.ok).toBe(true)
    const pub = r.game.session.publicState
    expect(pub.stage).toBe('over')
    expect(pub.outcome).toEqual({ kind: 'resign', winnerSeat: 1 })

    // A fresh game for the reverse direction: a resigned game can't be
    // resigned again (that rejection is the next test).
    const game2 = createChessGame(['p1', 'p2'], 'normal', 1)
    const r2 = applyChessAction(game2, 'p2', { type: 'RESIGN' })
    expect(r2.outcome.ok).toBe(true)
    expect(r2.game.session.publicState.outcome).toEqual({ kind: 'resign', winnerSeat: 0 })
  })

  it('resign is rejected when the game is already over', () => {
    const game = createChessGame(['p1', 'p2'], 'normal', 1)
    const r1 = applyChessAction(game, 'p1', { type: 'RESIGN' })
    const r2 = applyChessAction(r1.game, 'p2', { type: 'RESIGN' })
    expect(r2.outcome.ok).toBe(false)
    expect(r2.outcome.reason).toContain('play stage')
  })
})

describe('draw offers', () => {
  it('a draw offer is accepted by the other player, ending the game by agreement', () => {
    const game = createChessGame(['p1', 'p2'], 'normal', 1)
    const offer = applyChessAction(game, 'p1', { type: 'OFFER_DRAW' })
    expect(offer.outcome.ok).toBe(true)
    expect(offer.game.session.publicState.drawOfferBy).toBe('p1')

    const accept = applyChessAction(offer.game, 'p2', { type: 'ACCEPT_DRAW' })
    expect(accept.outcome.ok).toBe(true)
    const pub = accept.game.session.publicState
    expect(pub.stage).toBe('over')
    expect(pub.outcome).toEqual({ kind: 'draw', reason: 'agreement' })
  })

  it('a draw offer can be declined explicitly without ending the game', () => {
    const game = createChessGame(['p1', 'p2'], 'normal', 1)
    const offer = applyChessAction(game, 'p1', { type: 'OFFER_DRAW' })
    const decline = applyChessAction(offer.game, 'p2', { type: 'DECLINE_DRAW' })
    expect(decline.outcome.ok).toBe(true)
    const pub = decline.game.session.publicState
    expect(pub.drawOfferBy).toBeNull()
    expect(pub.stage).toBe('play')
    expect(pub.outcome).toBeNull()
  })

  it('a MOVE after an offer implicitly declines it', () => {
    const game = createChessGame(['p1', 'p2'], 'normal', 1)
    const offer = applyChessAction(game, 'p1', { type: 'OFFER_DRAW' })
    expect(offer.game.session.publicState.drawOfferBy).toBe('p1')
    // An offer doesn't consume the turn, so the offerer's own next move
    // implicitly clears the pending offer.
    const move = applyChessAction(offer.game, 'p1', { type: 'MOVE', from: 'e2', to: 'e4' })
    expect(move.outcome.ok).toBe(true)
    expect(move.game.session.publicState.drawOfferBy).toBeNull()
    expect(move.game.session.publicState.stage).toBe('play')
  })

  it('offering a draw out of turn is rejected', () => {
    const game = createChessGame(['p1', 'p2'], 'normal', 1)
    const r = applyChessAction(game, 'p2', { type: 'OFFER_DRAW' })
    expect(r.outcome.ok).toBe(false)
    expect(r.outcome.reason).toContain('turn')
  })

  it('accepting your own draw offer is rejected', () => {
    const game = createChessGame(['p1', 'p2'], 'normal', 1)
    const offer = applyChessAction(game, 'p1', { type: 'OFFER_DRAW' })
    const r = applyChessAction(offer.game, 'p1', { type: 'ACCEPT_DRAW' })
    expect(r.outcome.ok).toBe(false)
  })

  it('a second draw offer while one is pending is rejected', () => {
    const game = createChessGame(['p1', 'p2'], 'normal', 1)
    const offer = applyChessAction(game, 'p1', { type: 'OFFER_DRAW' })
    const r = applyChessAction(offer.game, 'p2', { type: 'OFFER_DRAW' })
    expect(r.outcome.ok).toBe(false)
  })

  it('declining a draw with no offer pending is rejected', () => {
    const game = createChessGame(['p1', 'p2'], 'normal', 1)
    const r = applyChessAction(game, 'p2', { type: 'DECLINE_DRAW' })
    expect(r.outcome.ok).toBe(false)
  })

  it('a RESIGN clears a pending draw offer', () => {
    const game = createChessGame(['p1', 'p2'], 'normal', 1)
    const offer = applyChessAction(game, 'p1', { type: 'OFFER_DRAW' })
    expect(offer.game.session.publicState.drawOfferBy).toBe('p1')
    const resign = applyChessAction(offer.game, 'p2', { type: 'RESIGN' })
    expect(resign.outcome.ok).toBe(true)
    const pub = resign.game.session.publicState
    expect(pub.stage).toBe('over')
    expect(pub.outcome).toEqual({ kind: 'resign', winnerSeat: 0 })
    expect(pub.drawOfferBy).toBeNull()
  })

  it('an accepted draw clears the pending offer', () => {
    const game = createChessGame(['p1', 'p2'], 'normal', 1)
    const offer = applyChessAction(game, 'p1', { type: 'OFFER_DRAW' })
    const accept = applyChessAction(offer.game, 'p2', { type: 'ACCEPT_DRAW' })
    expect(accept.outcome.ok).toBe(true)
    const pub = accept.game.session.publicState
    expect(pub.stage).toBe('over')
    expect(pub.outcome).toEqual({ kind: 'draw', reason: 'agreement' })
    expect(pub.drawOfferBy).toBeNull()
  })

  it('ACCEPT_DRAW and DECLINE_DRAW are rejected once the game is over', () => {
    // Oscar's repro: a pending offer, then RESIGN — the follow-up responses must
    // be rejected on the finished game instead of wrongly accepted.
    const game = createChessGame(['p1', 'p2'], 'normal', 1)
    const offer = applyChessAction(game, 'p1', { type: 'OFFER_DRAW' })
    const resign = applyChessAction(offer.game, 'p2', { type: 'RESIGN' })
    expect(resign.outcome.ok).toBe(true)
    expect(resign.game.session.publicState.stage).toBe('over')

    const accept = applyChessAction(resign.game, 'p2', { type: 'ACCEPT_DRAW' })
    expect(accept.outcome.ok).toBe(false)
    expect(accept.outcome.reason).toContain('play stage')

    const decline = applyChessAction(resign.game, 'p2', { type: 'DECLINE_DRAW' })
    expect(decline.outcome.ok).toBe(false)
    expect(decline.outcome.reason).toContain('play stage')
  })

  it('an unseated id cannot accept a draw offer', () => {
    const game = createChessGame(['p1', 'p2'], 'normal', 1)
    const offer = applyChessAction(game, 'p1', { type: 'OFFER_DRAW' })
    const r = applyChessAction(offer.game, 'ghost', { type: 'ACCEPT_DRAW' })
    expect(r.outcome.ok).toBe(false)
    expect(r.outcome.reason).toContain('seated player')
  })

  it('an unseated id cannot decline a draw offer', () => {
    const game = createChessGame(['p1', 'p2'], 'normal', 1)
    const offer = applyChessAction(game, 'p1', { type: 'OFFER_DRAW' })
    const r = applyChessAction(offer.game, 'ghost', { type: 'DECLINE_DRAW' })
    expect(r.outcome.ok).toBe(false)
    expect(r.outcome.reason).toContain('seated player')
  })
})

describe('outcomeFromChessJs', () => {
  it('reports threefold repetition as a draw/threefold', () => {
    const chess = new Chess()
    for (const lan of [
      'b1c3', 'b8c6', 'c3b1', 'c6b8',
      'b1c3', 'b8c6', 'c3b1', 'c6b8',
      'b1c3', 'b8c6', 'c3b1', 'c6b8',
    ]) {
      chess.move(lan)
    }
    expect(chess.isThreefoldRepetition()).toBe(true)
    expect(outcomeFromChessJs(chess, 1)).toEqual({ kind: 'draw', reason: 'threefold' })
  })

  it('reports insufficient material as a draw/insufficient-material', () => {
    const chess = new Chess('8/8/8/4k3/8/8/8/4K2N w - - 0 1') // K+N vs K
    expect(chess.isInsufficientMaterial()).toBe(true)
    expect(outcomeFromChessJs(chess, 0)).toEqual({ kind: 'draw', reason: 'insufficient-material' })
  })

  it('reports a fifty-move clock as a draw/fifty-move even with winning material', () => {
    const chess = new Chess('8/8/8/4k3/8/8/8/3QK3 w - - 100 1') // K+Q vs K, clock at 100
    expect(chess.isDrawByFiftyMoves()).toBe(true)
    expect(chess.isInsufficientMaterial()).toBe(false)
    expect(outcomeFromChessJs(chess, 0)).toEqual({ kind: 'draw', reason: 'fifty-move' })
  })

  it('returns null for a continuing position', () => {
    const chess = new Chess()
    expect(outcomeFromChessJs(chess, 0)).toBeNull()
  })
})

describe('wire safety', () => {
  it('a mid-game state survives assertWireSafe and a JSON round-trip', () => {
    const game = createChessGame(['p1', 'p2'], 'easy', 42)
    const r1 = applyChessAction(game, 'p1', { type: 'MOVE', from: 'e2', to: 'e4' })
    const r2 = applyChessAction(r1.game, 'p2', { type: 'MOVE', from: 'e7', to: 'e5' })
    const r3 = applyChessAction(r2.game, 'p1', { type: 'MOVE', from: 'g1', to: 'f3' })
    const r4 = applyChessAction(r3.game, 'p2', { type: 'MOVE', from: 'b8', to: 'c6' })
    const final = r4.game

    assertWireSafe(final.session.publicState, 'chess')
    assertWireSafe(final.session.privateStates, 'chess')
    expect(isJsonSerializable(final.session)).toBe(true)
    expect(JSON.parse(JSON.stringify(final.session))).toEqual(final.session)
    expect(typeof final.session.publicState.fen).toBe('string')
  })
})

describe('easy bot', () => {
  it('always returns a legal move across several seeded rng values', () => {
    const game = createChessGame(['p1', 'p2'], 'easy', 1)
    const chess = new Chess(game.session.publicState.fen)
    const legal = new Set(chess.moves({ verbose: true }).map((m) => `${m.from}${m.to}`))
    for (const seed of [1, 2, 3, 4, 5]) {
      const strategy = makeEasyChessBotStrategy(createRng(seed))
      const action = strategy(game.session.publicState, game.session.privateStates['p1'], 'p1')
      expect(action.type).toBe('MOVE')
      if (action.type === 'MOVE') {
        const lan = `${action.from}${action.to}`
        expect(legal.has(lan)).toBe(true)
      }
      const result = runChessBotTurn(game, 'p1', strategy)
      expect(result.outcome.ok).toBe(true)
    }
  })

  it('prefers captures over non-captures when both exist', () => {
    // White Ke1 + Nc3, black Ke8 + Ba2: exactly one capture (Nxa2) among many moves.
    const game = buildGame('4k3/8/8/8/8/2N5/b7/4K3 w - - 0 1')
    let capturePicks = 0
    const trials = 200
    for (let i = 0; i < trials; i++) {
      const action = makeEasyChessBotStrategy(createRng(i * 13 + 5))(
        game.session.publicState,
        game.session.privateStates['p1'],
        'p1',
      )
      expect(action.type).toBe('MOVE')
      if (action.type === 'MOVE') {
        expect(['a2', 'a4', 'b1', 'b5', 'd1', 'd2', 'd5', 'e2', 'e4', 'f1', 'f2']).toContain(action.to)
        if (action.to === 'a2') capturePicks++
      }
    }
    // 3x weighting over a 15-unit pool (1 capture weighted 3 + 12 non-captures)
    // → ~20% expected capture rate; require more than the 1/13 uniform baseline.
    expect(capturePicks).toBeGreaterThan(trials / 13)
  })

  it('promotes to a queen when a promotion move is chosen', () => {
    const game = buildGame('8/P6k/8/8/8/8/8/7K w - - 0 1')
    // The easy bot picks weighted-randomly; 4 of the 7 legal moves in this
    // position are a7-a8 promotions, so find a seed that lands on one.
    let pick: { action: ChessAction; seed: number } | null = null
    for (let seed = 0; seed < 50 && pick === null; seed++) {
      const action = makeEasyChessBotStrategy(createRng(seed))(
        game.session.publicState,
        game.session.privateStates['p1'],
        'p1',
      )
      if (action.type === 'MOVE' && action.from === 'a7') pick = { action, seed }
    }
    expect(pick).not.toBeNull()
    if (pick !== null) {
      expect(pick.action.type).toBe('MOVE')
      if (pick.action.type === 'MOVE') {
        expect(pick.action.from).toBe('a7')
        expect(pick.action.to).toBe('a8')
        expect(pick.action.promotion).toBe('q')
      }
      const result = runChessBotTurn(game, 'p1', makeEasyChessBotStrategy(createRng(pick.seed)))
      expect(result.outcome.ok).toBe(true)
    }
  })
})

describe('normal bot', () => {
  it('avoids a move that hangs a piece when a safe move exists', () => {
    // White Ke1 + Nd5, black Kg8 + Rd8 + Bc5. The knight is hanging to Rxd5,
    // so any king move loses it; Nb6/Ne7/Ne3/Nb4 drop it to Bxb6/Bxe7/Bxe3/Bxb4.
    // Only Nc7/Nf6/Nf4/Nc3 keep it safe — the bot must pick one of those.
    const game = buildGame('3r2k1/8/8/2bN4/8/8/8/4K3 w - - 0 1')
    const action = makeNormalChessBotStrategy()(
      game.session.publicState,
      game.session.privateStates['p1'],
      'p1',
    )
    expect(action.type).toBe('MOVE')
    if (action.type === 'MOVE') {
      expect(action.from).toBe('d5')
      expect(['c7', 'f6', 'f4', 'c3']).toContain(action.to)
    }
    const result = runChessBotTurn(game, 'p1', makeNormalChessBotStrategy())
    expect(result.outcome.ok).toBe(true)
  })

  it('returns a legal move from the starting position', () => {
    const game = createChessGame(['p1', 'p2'], 'normal', 1)
    const strategy = makeNormalChessBotStrategy()
    const action = strategy(game.session.publicState, game.session.privateStates['p1'], 'p1')
    expect(action.type).toBe('MOVE')
    const result = runChessBotTurn(game, 'p1', strategy)
    expect(result.outcome.ok).toBe(true)
  })

  it('plays a black-side reply from a mid-game position', () => {
    const game = playMoves('e2e4')
    const strategy = makeNormalChessBotStrategy()
    const action = strategy(game.session.publicState, game.session.privateStates['p2'], 'p2')
    expect(action.type).toBe('MOVE')
    const result = runChessBotTurn(game, 'p2', strategy)
    expect(result.outcome.ok).toBe(true)
  })

  it('does not stalemate a lone king when a winning continuation exists (Oscar\u2019s repro)', () => {
    // White K+R vs lone black king. a4b4 stalemates black (a draw thrown away
    // for a forced win); every rook-retaining move keeps the material edge. The
    // bot must not pick the stalemate — a draw must not outscore a real
    // material-winning continuation.
    const game = buildGame('8/8/8/8/R7/K7/8/k7 w - - 0 1')
    const action = makeNormalChessBotStrategy()(
      game.session.publicState,
      game.session.privateStates['p1'],
      'p1',
    )
    expect(action.type).toBe('MOVE')
    if (action.type === 'MOVE') {
      const chess = new Chess(game.session.publicState.fen)
      if (action.promotion === undefined) {
        chess.move({ from: action.from, to: action.to })
      } else {
        chess.move({ from: action.from, to: action.to, promotion: action.promotion })
      }
      expect(chess.isStalemate()).toBe(false)
      expect(chess.fen().split(' ')[0]).toContain('R') // the rook is still on the board
    }
    const result = runChessBotTurn(game, 'p1', makeNormalChessBotStrategy())
    expect(result.outcome.ok).toBe(true)
    expect(result.game.session.publicState.stage).toBe('play')
    expect(result.game.session.publicState.outcome).toBeNull()
  })
})
