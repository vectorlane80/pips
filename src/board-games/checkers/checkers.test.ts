import { describe, expect, it } from 'vitest'
import { applyCheckersAction, runCheckersBotTurn, validateCheckersAction } from './rules.ts'
import { makeCheckersBotStrategy } from './bot.ts'
import {
  CHECKERS_TARGET,
  capturesFrom,
  createCheckersBoard,
  createCheckersGame,
  dirsFor,
  hasAnyMove,
  movesFrom,
  type CheckerCell,
  type CheckersAction,
  type CheckersPrivateState,
  type CheckersPublicState,
  type CheckersSession,
  type CheckersStage,
  type LastCheckersMove,
} from './state.ts'
import { createRng } from '../../engine/rng.ts'
import { assertWireSafe, createHostSession, isJsonSerializable } from '../../engine/sync.ts'
import { createTurnState, currentPlayer } from '../../engine/turn-engine.ts'

function emptyBoard(): (CheckerCell | null)[] {
  return Array.from({ length: 64 }, () => null)
}

function place(board: (CheckerCell | null)[], seat: 0 | 1, cells: number[], king = false): void {
  for (const c of cells) board[c] = { seat, king }
}

function idx(row: number, col: number): number {
  return row * 8 + col
}

// p1 = seat 0 (bottom), p2 = seat 1 (top); current player defaults to p1.
function buildGame(config: {
  board: (CheckerCell | null)[]
  chainCell?: number | null
  gamesWon?: Record<string, number>
  gameNumber?: number
  starterSeat?: 0 | 1
  stage?: CheckersStage
  lastMove?: LastCheckersMove | null
}): CheckersSession {
  const playerOrder: [string, string] = ['p1', 'p2']
  const publicState: CheckersPublicState = {
    stage: config.stage ?? 'play',
    turn: createTurnState(playerOrder, 'play'),
    seatOrder: playerOrder,
    board: config.board,
    chainCell: config.chainCell ?? null,
    gamesWon: config.gamesWon ?? { p1: 0, p2: 0 },
    target: CHECKERS_TARGET,
    gameNumber: config.gameNumber ?? 1,
    starterSeat: config.starterSeat ?? 0,
    gameWinnerId: null,
    matchWinnerId: null,
    lastMove: config.lastMove ?? null,
  }
  const privateStates: Record<string, CheckersPrivateState> = { p1: {}, p2: {} }
  return { session: createHostSession(publicState, privateStates), rng: createRng(0) }
}

describe('checkers board helpers', () => {
  it('the opening board has 12 men per seat on the dark squares in the right rows', () => {
    const board = createCheckersBoard()
    expect(board).toHaveLength(64)
    const seat0: number[] = []
    const seat1: number[] = []
    for (let i = 0; i < board.length; i++) {
      const cell = board[i]
      if (cell === null) continue
      const row = Math.floor(i / 8)
      const col = i % 8
      expect((row + col) % 2).toBe(1) // playable dark square
      expect(cell.king).toBe(false)
      if (cell.seat === 0) {
        seat0.push(i)
        expect(row).toBeGreaterThanOrEqual(5) // seat 0 sits at the bottom
      } else {
        seat1.push(i)
        expect(row).toBeLessThanOrEqual(2) // seat 1 at the top
      }
    }
    expect(seat0).toHaveLength(12)
    expect(seat1).toHaveLength(12)
    expect(board.filter((c) => c !== null)).toHaveLength(24)
  })

  it('the opening board leaves rows 3–4 and every light square empty', () => {
    const board = createCheckersBoard()
    for (let i = 0; i < board.length; i++) {
      const row = Math.floor(i / 8)
      const col = i % 8
      if (row === 3 || row === 4 || (row + col) % 2 === 0) {
        expect(board[i]).toBeNull()
      }
    }
  })

  it('dirsFor gives men one forward diagonal per seat and kings all four', () => {
    expect(dirsFor(0, false)).toEqual([[-1, -1], [-1, 1]])
    expect(dirsFor(1, false)).toEqual([[1, -1], [1, 1]])
    expect(dirsFor(0, true)).toEqual([[-1, -1], [-1, 1], [1, -1], [1, 1]])
    expect(dirsFor(1, true)).toEqual([[-1, -1], [-1, 1], [1, -1], [1, 1]])
  })

  it('men move one diagonal forward, direction depending on seat', () => {
    const board = emptyBoard()
    place(board, 0, [idx(5, 2)])
    place(board, 1, [idx(2, 1)])
    expect(movesFrom(board, idx(5, 2))).toEqual([{ to: idx(4, 1) }, { to: idx(4, 3) }])
    expect(movesFrom(board, idx(2, 1))).toEqual([{ to: idx(3, 0) }, { to: idx(3, 2) }])
  })

  it('men on columns 0 and 7 offer no wrapped moves or captures', () => {
    const boardA = emptyBoard()
    place(boardA, 0, [idx(5, 0)])
    expect(movesFrom(boardA, idx(5, 0))).toEqual([{ to: idx(4, 1) }])

    const boardB = emptyBoard()
    place(boardB, 0, [idx(4, 7)])
    expect(movesFrom(boardB, idx(4, 7))).toEqual([{ to: idx(3, 6) }])

    const boardC = emptyBoard()
    place(boardC, 0, [idx(4, 7)])
    place(boardC, 1, [idx(3, 6), idx(3, 0)])
    expect(capturesFrom(boardC, idx(4, 7))).toEqual([{ to: idx(2, 5), capIdx: idx(3, 6) }])
  })

  it('hasAnyMove reports whether a seat has any legal move', () => {
    const empty = emptyBoard()
    expect(hasAnyMove(empty, 0)).toBe(false)
    expect(hasAnyMove(empty, 1)).toBe(false)

    const farRows = emptyBoard()
    place(farRows, 0, [idx(0, 5)]) // seat 0 man on the far row: no forward squares
    place(farRows, 1, [idx(7, 2)]) // seat 1 man on the far row: no forward squares
    expect(hasAnyMove(farRows, 0)).toBe(false)
    expect(hasAnyMove(farRows, 1)).toBe(false)

    const capture = emptyBoard()
    place(capture, 0, [idx(4, 1)])
    place(capture, 1, [idx(3, 2)])
    expect(hasAnyMove(capture, 0)).toBe(true) // via the jump over the enemy man
    expect(hasAnyMove(capture, 1)).toBe(true) // via a simple forward move
  })
})

describe('MOVE validation', () => {
  it('rejects moving onto an occupied square', () => {
    const board = emptyBoard()
    place(board, 0, [idx(5, 0), idx(4, 1)])
    const game = buildGame({ board })
    const r = applyCheckersAction(game, 'p1', { type: 'MOVE', from: idx(5, 0), to: idx(4, 1) })
    expect(r.outcome.ok).toBe(false)
    expect(r.outcome.reason).toContain('legal move')
  })

  it('rejects moving a piece you do not own', () => {
    const board = emptyBoard()
    place(board, 0, [idx(5, 0)])
    place(board, 1, [idx(2, 1)])
    const game = buildGame({ board })
    const r = applyCheckersAction(game, 'p1', { type: 'MOVE', from: idx(2, 1), to: idx(3, 2) })
    expect(r.outcome.ok).toBe(false)
    expect(r.outcome.reason).toContain('not your piece')
  })

  it('rejects an out-of-turn MOVE', () => {
    const game = createCheckersGame(['p1', 'p2'], 1)
    expect(currentPlayer(game.session.publicState.turn)).toBe('p1')
    const r = applyCheckersAction(game, 'p2', { type: 'MOVE', from: idx(2, 1), to: idx(3, 2) })
    expect(r.outcome.ok).toBe(false)
    expect(r.outcome.reason).toContain('turn')
  })

  it('rejects a MOVE from an empty square', () => {
    const game = createCheckersGame(['p1', 'p2'], 1)
    const r = applyCheckersAction(game, 'p1', { type: 'MOVE', from: idx(4, 1), to: idx(3, 2) })
    expect(r.outcome.ok).toBe(false)
    expect(r.outcome.reason).toContain('no piece there')
  })

  it('rejects non-integer and out-of-range squares', () => {
    const game = createCheckersGame(['p1', 'p2'], 1)
    for (const move of [
      { from: -1, to: idx(4, 1) },
      { from: idx(5, 0), to: 64 },
      { from: 5.5, to: idx(4, 1) },
      { from: idx(5, 0), to: idx(4, 1) + 0.5 },
      { from: NaN, to: idx(4, 1) },
    ]) {
      const r = applyCheckersAction(game, 'p1', { type: 'MOVE', from: move.from, to: move.to })
      expect(r.outcome.ok).toBe(false)
    }
  })

  it('the validator rejects an unknown action type', () => {
    const game = createCheckersGame(['p1', 'p2'], 1)
    const result = validateCheckersAction(game.session, 'p1', { type: 'BOGUS' } as unknown as CheckersAction)
    expect(result.ok).toBe(false)
    expect(result.reason).toContain('unknown action')
  })
})

describe('captures', () => {
  it('a simple move is allowed even when a capture is available', () => {
    const board = emptyBoard()
    place(board, 0, [idx(4, 1)])
    place(board, 1, [idx(3, 2)])
    const game = buildGame({ board })
    const r = applyCheckersAction(game, 'p1', { type: 'MOVE', from: idx(4, 1), to: idx(3, 0) })
    expect(r.outcome.ok).toBe(true)
    const pub = r.game.session.publicState
    expect(pub.board[idx(3, 0)]).toEqual({ seat: 0, king: false })
    expect(pub.board[idx(4, 1)]).toBeNull()
    expect(pub.lastMove).toEqual({
      by: 'p1',
      from: idx(4, 1),
      to: idx(3, 0),
      captured: null,
      crowned: false,
      chainContinues: false,
    })
    expect(currentPlayer(pub.turn)).toBe('p2')
  })

  it('a jump removes the jumped piece and lands correctly', () => {
    const board = emptyBoard()
    place(board, 0, [idx(4, 1)])
    place(board, 1, [idx(3, 2), idx(1, 0)])
    const game = buildGame({ board })
    const r = applyCheckersAction(game, 'p1', { type: 'MOVE', from: idx(4, 1), to: idx(2, 3) })
    expect(r.outcome.ok).toBe(true)
    const pub = r.game.session.publicState
    expect(pub.board[idx(4, 1)]).toBeNull()
    expect(pub.board[idx(3, 2)]).toBeNull() // captured piece removed
    expect(pub.board[idx(2, 3)]).toEqual({ seat: 0, king: false })
    expect(pub.lastMove).toEqual({
      by: 'p1',
      from: idx(4, 1),
      to: idx(2, 3),
      captured: idx(3, 2),
      crowned: false,
      chainContinues: false,
    })
    expect(currentPlayer(pub.turn)).toBe('p2')
  })

  it('rejects a jump over your own piece', () => {
    const board = emptyBoard()
    place(board, 0, [idx(4, 1), idx(3, 2)])
    const game = buildGame({ board })
    const r = applyCheckersAction(game, 'p1', { type: 'MOVE', from: idx(4, 1), to: idx(2, 3) })
    expect(r.outcome.ok).toBe(false)
    expect(r.outcome.reason).toContain('legal move')
  })

  it('rejects a jump onto an occupied landing square', () => {
    const board = emptyBoard()
    place(board, 0, [idx(4, 1)])
    place(board, 1, [idx(3, 2), idx(2, 3)])
    const game = buildGame({ board })
    const r = applyCheckersAction(game, 'p1', { type: 'MOVE', from: idx(4, 1), to: idx(2, 3) })
    expect(r.outcome.ok).toBe(false)
    expect(r.outcome.reason).toContain('legal move')
  })
})

describe('multi-jump chains', () => {
  it('after a jump with a follow-up capture, the mover stays current and chainCell is set', () => {
    const board = emptyBoard()
    place(board, 0, [idx(5, 2), idx(6, 1)])
    place(board, 1, [idx(4, 3), idx(2, 3), idx(1, 0)])
    const game = buildGame({ board })
    const r = applyCheckersAction(game, 'p1', { type: 'MOVE', from: idx(5, 2), to: idx(3, 4) })
    expect(r.outcome.ok).toBe(true)
    const pub = r.game.session.publicState
    expect(pub.board[idx(4, 3)]).toBeNull()
    expect(pub.board[idx(3, 4)]).toEqual({ seat: 0, king: false })
    expect(pub.chainCell).toBe(idx(3, 4))
    expect(currentPlayer(pub.turn)).toBe('p1')
    expect(pub.turn.turnNumber).toBe(1)
    expect(pub.lastMove).toEqual({
      by: 'p1',
      from: idx(5, 2),
      to: idx(3, 4),
      captured: idx(4, 3),
      crowned: false,
      chainContinues: true,
    })
  })

  it('while chained, moving a different piece is rejected', () => {
    const board = emptyBoard()
    place(board, 0, [idx(3, 4), idx(6, 1)])
    place(board, 1, [idx(2, 3), idx(1, 0)])
    const game = buildGame({ board, chainCell: idx(3, 4) })
    const r = applyCheckersAction(game, 'p1', { type: 'MOVE', from: idx(6, 1), to: idx(5, 0) })
    expect(r.outcome.ok).toBe(false)
    expect(r.outcome.reason).toContain('chain')
  })

  it('while chained, a simple move of the chained piece is rejected', () => {
    const board = emptyBoard()
    place(board, 0, [idx(3, 4)])
    place(board, 1, [idx(2, 3), idx(1, 0)])
    const game = buildGame({ board, chainCell: idx(3, 4) })
    const r = applyCheckersAction(game, 'p1', { type: 'MOVE', from: idx(3, 4), to: idx(2, 5) })
    expect(r.outcome.ok).toBe(false)
    expect(r.outcome.reason).toContain('capture')
  })

  it('the continuation jump is accepted and the chain end advances the turn', () => {
    const board = emptyBoard()
    place(board, 0, [idx(3, 4), idx(6, 1)])
    place(board, 1, [idx(2, 3), idx(1, 0)])
    const game = buildGame({ board, chainCell: idx(3, 4) })
    const r = applyCheckersAction(game, 'p1', { type: 'MOVE', from: idx(3, 4), to: idx(1, 2) })
    expect(r.outcome.ok).toBe(true)
    const pub = r.game.session.publicState
    expect(pub.board[idx(2, 3)]).toBeNull() // second captured piece removed
    expect(pub.board[idx(1, 2)]).toEqual({ seat: 0, king: false })
    expect(pub.chainCell).toBeNull()
    expect(pub.lastMove).toEqual({
      by: 'p1',
      from: idx(3, 4),
      to: idx(1, 2),
      captured: idx(2, 3),
      crowned: false,
      chainContinues: false,
    })
    expect(currentPlayer(pub.turn)).toBe('p2')
    expect(pub.turn.turnNumber).toBe(2)
  })
})

describe('crowning', () => {
  it('a man reaching the far row becomes a king', () => {
    const board = emptyBoard()
    place(board, 0, [idx(1, 5)])
    place(board, 1, [idx(1, 0)])
    const game = buildGame({ board })
    const r = applyCheckersAction(game, 'p1', { type: 'MOVE', from: idx(1, 5), to: idx(0, 4) })
    expect(r.outcome.ok).toBe(true)
    const pub = r.game.session.publicState
    expect(pub.board[idx(0, 4)]).toEqual({ seat: 0, king: true })
    expect(pub.lastMove).toEqual({
      by: 'p1',
      from: idx(1, 5),
      to: idx(0, 4),
      captured: null,
      crowned: true,
      chainContinues: false,
    })
    expect(currentPlayer(pub.turn)).toBe('p2')
  })

  it('crowning via a jump ends the chain even with a backward capture available', () => {
    const board = emptyBoard()
    place(board, 0, [idx(2, 3)])
    place(board, 1, [idx(1, 4), idx(1, 6)])
    const game = buildGame({ board })
    const r = applyCheckersAction(game, 'p1', { type: 'MOVE', from: idx(2, 3), to: idx(0, 5) })
    expect(r.outcome.ok).toBe(true)
    const pub = r.game.session.publicState
    expect(pub.board[idx(0, 5)]).toEqual({ seat: 0, king: true })
    expect(pub.board[idx(1, 4)]).toBeNull()
    expect(pub.chainCell).toBeNull()
    expect(pub.lastMove).toEqual({
      by: 'p1',
      from: idx(2, 3),
      to: idx(0, 5),
      captured: idx(1, 4),
      crowned: true,
      chainContinues: false,
    })
    // the fresh king could jump backward over the remaining enemy man…
    expect(capturesFrom(pub.board, idx(0, 5))).toEqual([{ to: idx(2, 7), capIdx: idx(1, 6) }])
    // …but crowning ends the move anyway: the turn passes.
    expect(currentPlayer(pub.turn)).toBe('p2')
  })
})

describe('kings', () => {
  it('a king moves in all four directions', () => {
    const board = emptyBoard()
    place(board, 0, [idx(4, 4)], true)
    expect(movesFrom(board, idx(4, 4))).toEqual([
      { to: idx(3, 3) },
      { to: idx(3, 5) },
      { to: idx(5, 3) },
      { to: idx(5, 5) },
    ])
  })

  it('a king captures in all four directions', () => {
    const board = emptyBoard()
    place(board, 0, [idx(4, 4)], true)
    place(board, 1, [idx(3, 3), idx(3, 5), idx(5, 3), idx(5, 5)])
    expect(capturesFrom(board, idx(4, 4))).toEqual([
      { to: idx(2, 2), capIdx: idx(3, 3) },
      { to: idx(2, 6), capIdx: idx(3, 5) },
      { to: idx(6, 2), capIdx: idx(5, 3) },
      { to: idx(6, 6), capIdx: idx(5, 5) },
    ])
    const game = buildGame({ board })
    const r = applyCheckersAction(game, 'p1', { type: 'MOVE', from: idx(4, 4), to: idx(6, 2) })
    expect(r.outcome.ok).toBe(true)
    const pub = r.game.session.publicState
    expect(pub.board[idx(6, 2)]).toEqual({ seat: 0, king: true })
    expect(pub.board[idx(5, 3)]).toBeNull()
    expect(pub.lastMove).toEqual({
      by: 'p1',
      from: idx(4, 4),
      to: idx(6, 2),
      captured: idx(5, 3),
      crowned: false,
      chainContinues: false,
    })
    expect(currentPlayer(pub.turn)).toBe('p2')
  })
})

describe('game end', () => {
  it('capturing the opponent\u2019s last piece ends the game and scores it', () => {
    const board = emptyBoard()
    place(board, 0, [idx(4, 1)])
    place(board, 1, [idx(3, 2)])
    const game = buildGame({ board })
    const r = applyCheckersAction(game, 'p1', { type: 'MOVE', from: idx(4, 1), to: idx(2, 3) })
    expect(r.outcome.ok).toBe(true)
    const pub = r.game.session.publicState
    expect(pub.stage).toBe('gameEnd')
    expect(pub.gameWinnerId).toBe('p1')
    expect(pub.gamesWon).toEqual({ p1: 1, p2: 0 })
    expect(pub.matchWinnerId).toBeNull()
    expect(pub.board.filter((c) => c !== null)).toHaveLength(1)
    expect(currentPlayer(pub.turn)).toBe('p1') // turn untouched on game end
    expect(pub.turn.turnNumber).toBe(1)
  })

  it('leaving the opponent with no legal move ends the game', () => {
    const board = emptyBoard()
    place(board, 0, [idx(4, 1), idx(1, 6), idx(2, 5)]) // the two box the lone p2 man in
    place(board, 1, [idx(0, 7)])
    const game = buildGame({ board })
    expect(hasAnyMove(board, 1)).toBe(false)
    const r = applyCheckersAction(game, 'p1', { type: 'MOVE', from: idx(4, 1), to: idx(3, 0) })
    expect(r.outcome.ok).toBe(true)
    const pub = r.game.session.publicState
    expect(pub.stage).toBe('gameEnd')
    expect(pub.gameWinnerId).toBe('p1')
    expect(pub.gamesWon).toEqual({ p1: 1, p2: 0 })
  })

  it('a third game win ends the match with matchWinnerId set', () => {
    const board = emptyBoard()
    place(board, 0, [idx(4, 1)])
    place(board, 1, [idx(3, 2)])
    const game = buildGame({ board, gamesWon: { p1: 2, p2: 0 } })
    const r = applyCheckersAction(game, 'p1', { type: 'MOVE', from: idx(4, 1), to: idx(2, 3) })
    expect(r.outcome.ok).toBe(true)
    const pub = r.game.session.publicState
    expect(pub.stage).toBe('over')
    expect(pub.gameWinnerId).toBe('p1')
    expect(pub.matchWinnerId).toBe('p1')
    expect(pub.gamesWon).toEqual({ p1: 3, p2: 0 })
  })

  it('MOVE and NEXT_GAME are both rejected after the match is over', () => {
    const board = emptyBoard()
    place(board, 0, [idx(4, 1)])
    place(board, 1, [idx(3, 2)])
    const game = buildGame({ board, gamesWon: { p1: 2, p2: 0 } })
    const r1 = applyCheckersAction(game, 'p1', { type: 'MOVE', from: idx(4, 1), to: idx(2, 3) })
    expect(r1.game.session.publicState.stage).toBe('over')

    const m = applyCheckersAction(r1.game, 'p1', { type: 'MOVE', from: idx(2, 3), to: idx(1, 2) })
    expect(m.outcome.ok).toBe(false)
    expect(m.outcome.reason).toContain('play stage')

    const n = applyCheckersAction(r1.game, 'p1', { type: 'NEXT_GAME' })
    expect(n.outcome.ok).toBe(false)
    expect(n.outcome.reason).toContain('gameEnd')
  })
})

describe('NEXT_GAME', () => {
  it('NEXT_GAME is rejected during play', () => {
    const game = createCheckersGame(['p1', 'p2'], 1)
    const r = applyCheckersAction(game, 'p1', { type: 'NEXT_GAME' })
    expect(r.outcome.ok).toBe(false)
    expect(r.outcome.reason).toContain('gameEnd')
  })

  it('NEXT_GAME resets the board, flips the starter, and carries gamesWon', () => {
    const board = emptyBoard()
    place(board, 0, [idx(4, 1)])
    place(board, 1, [idx(3, 2)])
    const game = buildGame({ board })
    const r1 = applyCheckersAction(game, 'p1', { type: 'MOVE', from: idx(4, 1), to: idx(2, 3) })
    expect(r1.game.session.publicState.stage).toBe('gameEnd')

    const r2 = applyCheckersAction(r1.game, 'p1', { type: 'NEXT_GAME' })
    expect(r2.outcome.ok).toBe(true)
    const pub = r2.game.session.publicState
    expect(pub.stage).toBe('play')
    expect(pub.gameNumber).toBe(2)
    expect(pub.starterSeat).toBe(1)
    expect(currentPlayer(pub.turn)).toBe('p2') // starter alternates: the other seat opens
    expect(pub.board).toEqual(createCheckersBoard())
    expect(pub.board.filter((c) => c !== null)).toHaveLength(24)
    expect(pub.chainCell).toBeNull()
    expect(pub.gameWinnerId).toBeNull()
    expect(pub.lastMove).toBeNull()
    expect(pub.gamesWon).toEqual({ p1: 1, p2: 0 }) // carries over
  })

  it('the starter alternates back on the following game end', () => {
    const game = buildGame({
      board: createCheckersBoard(),
      stage: 'gameEnd',
      gameNumber: 2,
      starterSeat: 1,
      gamesWon: { p1: 1, p2: 0 },
    })
    const r = applyCheckersAction(game, 'p2', { type: 'NEXT_GAME' })
    expect(r.outcome.ok).toBe(true)
    const pub = r.game.session.publicState
    expect(pub.stage).toBe('play')
    expect(pub.gameNumber).toBe(3)
    expect(pub.starterSeat).toBe(0)
    expect(currentPlayer(pub.turn)).toBe('p1')
  })
})

describe('wire safety', () => {
  it('state survives assertWireSafe and a JSON round-trip after several moves', () => {
    const game = createCheckersGame(['p1', 'p2'], 42)
    const r1 = applyCheckersAction(game, 'p1', { type: 'MOVE', from: idx(5, 0), to: idx(4, 1) })
    expect(r1.outcome.ok).toBe(true)
    expect(currentPlayer(r1.game.session.publicState.turn)).toBe('p2')
    const r2 = applyCheckersAction(r1.game, 'p2', { type: 'MOVE', from: idx(2, 1), to: idx(3, 2) })
    expect(r2.outcome.ok).toBe(true)
    expect(currentPlayer(r2.game.session.publicState.turn)).toBe('p1')
    const r3 = applyCheckersAction(r2.game, 'p1', { type: 'MOVE', from: idx(5, 2), to: idx(4, 3) })
    expect(r3.outcome.ok).toBe(true)
    const final = r3.game

    assertWireSafe(final.session.publicState, 'checkers')
    assertWireSafe(final.session.privateStates, 'checkers')
    expect(isJsonSerializable(final.session)).toBe(true)
    expect(JSON.parse(JSON.stringify(final.session))).toEqual(final.session)
  })
})

describe('checkers bot', () => {
  it('a chained bot returns the continuation jump from the chain cell', () => {
    const board = emptyBoard()
    place(board, 0, [idx(3, 4)])
    place(board, 1, [idx(2, 3)])
    const game = buildGame({ board, chainCell: idx(3, 4) })
    const strategy = makeCheckersBotStrategy(createRng(3))
    const action = strategy(game.session.publicState, game.session.privateStates['p1'], 'p1')
    expect(action).toEqual({ type: 'MOVE', from: idx(3, 4), to: idx(1, 2) })
    const result = runCheckersBotTurn(game, 'p1', strategy)
    expect(result.outcome.ok).toBe(true)
  })

  it('a bot with only simple moves returns a legal one', () => {
    const board = emptyBoard()
    place(board, 0, [idx(5, 0)])
    place(board, 1, [idx(2, 1)])
    const game = buildGame({ board })
    const strategy = makeCheckersBotStrategy(createRng(4))
    const action = strategy(game.session.publicState, game.session.privateStates['p1'], 'p1') as {
      type: 'MOVE'
      from: number
      to: number
    }
    expect(action.type).toBe('MOVE')
    expect(action.from).toBe(idx(5, 0))
    expect(action.to).toBe(idx(4, 1))
    expect(movesFrom(board, action.from).some((m) => m.to === action.to)).toBe(true)
    const result = runCheckersBotTurn(game, 'p1', strategy)
    expect(result.outcome.ok).toBe(true)
  })

  it('a bot prefers a capture when one exists', () => {
    const board = emptyBoard()
    place(board, 0, [idx(4, 1), idx(6, 1)])
    place(board, 1, [idx(3, 2)])
    const game = buildGame({ board })
    const strategy = makeCheckersBotStrategy(createRng(7))
    const action = strategy(game.session.publicState, game.session.privateStates['p1'], 'p1')
    expect(action).toEqual({ type: 'MOVE', from: idx(4, 1), to: idx(2, 3) })
    const result = runCheckersBotTurn(game, 'p1', strategy)
    expect(result.outcome.ok).toBe(true)
  })
})
