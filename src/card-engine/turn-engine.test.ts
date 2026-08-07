import { describe, expect, it } from 'vitest'
import {
  advanceTurn,
  createTurnState,
  currentPlayer,
  extraTurn,
  reverseDirection,
  setPhase,
  skipNext,
} from './turn-engine.ts'
import type { TurnState } from './turn-engine.ts'

// Phase type used in most tests — proves the phase field is truly opaque/generic
type P = 'a' | 'b'

// ---------------------------------------------------------------------------
// createTurnState
// ---------------------------------------------------------------------------

describe('createTurnState', () => {
  it('produces the expected initial TurnState', () => {
    const state = createTurnState<P>(['p1', 'p2', 'p3'], 'a')
    expect(state).toEqual({
      playerOrder: ['p1', 'p2', 'p3'],
      currentIndex: 0,
      direction: 1,
      phase: 'a',
      turnNumber: 1,
    })
  })

  it('copies the input array so later mutation does not affect state', () => {
    const players = ['p1', 'p2', 'p3']
    const state = createTurnState<P>(players, 'a')
    players.push('p4')
    expect(state.playerOrder).toEqual(['p1', 'p2', 'p3'])
  })
})

// ---------------------------------------------------------------------------
// currentPlayer
// ---------------------------------------------------------------------------

describe('currentPlayer', () => {
  it('returns the player at currentIndex', () => {
    const state: TurnState<P> = {
      playerOrder: ['alice', 'bob', 'carol'],
      currentIndex: 0,
      direction: 1,
      phase: 'a',
      turnNumber: 1,
    }
    expect(currentPlayer(state)).toBe('alice')
  })

  it('returns the right id for a non-zero currentIndex', () => {
    const state: TurnState<P> = {
      playerOrder: ['alice', 'bob', 'carol'],
      currentIndex: 2,
      direction: 1,
      phase: 'a',
      turnNumber: 1,
    }
    expect(currentPlayer(state)).toBe('carol')
  })
})

// ---------------------------------------------------------------------------
// advanceTurn
// ---------------------------------------------------------------------------

describe('advanceTurn', () => {
  it('forward: cycles through indices 1, 2, 0 and increments turnNumber', () => {
    let state = createTurnState<P>(['p1', 'p2', 'p3'], 'a')

    state = advanceTurn(state, 'b')
    expect(state.currentIndex).toBe(1)
    expect(state.phase).toBe('b')
    expect(state.turnNumber).toBe(2)

    state = advanceTurn(state, 'a')
    expect(state.currentIndex).toBe(2)
    expect(state.phase).toBe('a')
    expect(state.turnNumber).toBe(3)

    state = advanceTurn(state, 'b')
    expect(state.currentIndex).toBe(0)
    expect(state.phase).toBe('b')
    expect(state.turnNumber).toBe(4)
  })

  it('backward: direction -1 cycles through indices 2, 1, 0 and increments turnNumber', () => {
    let state = createTurnState<P>(['p1', 'p2', 'p3'], 'a')
    state = reverseDirection(state) // direction is now -1

    state = advanceTurn(state, 'b')
    expect(state.currentIndex).toBe(2)
    expect(state.phase).toBe('b')
    expect(state.turnNumber).toBe(2)

    state = advanceTurn(state, 'a')
    expect(state.currentIndex).toBe(1)
    expect(state.phase).toBe('a')
    expect(state.turnNumber).toBe(3)

    state = advanceTurn(state, 'b')
    expect(state.currentIndex).toBe(0)
    expect(state.phase).toBe('b')
    expect(state.turnNumber).toBe(4)
  })

  it('with 5 players: forward advanceTurn wraps around 1, 2, 3, 4, 0', () => {
    let state = createTurnState<P>(['p1', 'p2', 'p3', 'p4', 'p5'], 'a')
    const seen: number[] = []
    for (let i = 0; i < 5; i++) {
      state = advanceTurn(state, 'a')
      seen.push(state.currentIndex)
    }
    expect(seen).toEqual([1, 2, 3, 4, 0])
    expect(state.turnNumber).toBe(6)
  })

  it('with 5 players: backward advanceTurn wraps around 4, 3, 2, 1, 0', () => {
    let state = createTurnState<P>(['p1', 'p2', 'p3', 'p4', 'p5'], 'a')
    state = reverseDirection(state) // direction is now -1
    const seen: number[] = []
    for (let i = 0; i < 5; i++) {
      state = advanceTurn(state, 'a')
      seen.push(state.currentIndex)
    }
    expect(seen).toEqual([4, 3, 2, 1, 0])
    expect(state.turnNumber).toBe(6)
  })
})

// ---------------------------------------------------------------------------
// skipNext
// ---------------------------------------------------------------------------

describe('skipNext', () => {
  it('forward: skips one player, turnNumber increments by exactly 1', () => {
    const state = createTurnState<P>(['p1', 'p2', 'p3'], 'a')
    const result = skipNext(state, 'b')
    expect(result).toEqual({
      playerOrder: ['p1', 'p2', 'p3'],
      currentIndex: 2,
      direction: 1,
      phase: 'b',
      turnNumber: 2,
    })
  })

  it('backward: skips one player in reverse direction', () => {
    let state = createTurnState<P>(['p1', 'p2', 'p3'], 'a')
    state = reverseDirection(state) // direction is -1, currentIndex is 0
    const result = skipNext(state, 'b')
    expect(result).toEqual({
      playerOrder: ['p1', 'p2', 'p3'],
      currentIndex: 1,
      direction: -1,
      phase: 'b',
      turnNumber: 2,
    })
  })

  it('with 2 players: skipNext from index 0 wraps back to index 0', () => {
    const state = createTurnState<P>(['p1', 'p2'], 'a')
    const result = skipNext(state, 'b')
    expect(result).toEqual({
      playerOrder: ['p1', 'p2'],
      currentIndex: 0,
      direction: 1,
      phase: 'b',
      turnNumber: 2,
    })
  })

  it('with 2 players: skipNext from index 1 wraps back to index 1', () => {
    let state = createTurnState<P>(['p1', 'p2'], 'a')
    state = advanceTurn(state, 'a') // now at index 1 (p2's turn)
    const result = skipNext(state, 'b')
    expect(result).toEqual({
      playerOrder: ['p1', 'p2'],
      currentIndex: 1,
      direction: 1,
      phase: 'b',
      turnNumber: 3,
    })
  })

  it('with 5 players: skipNext from index 0 lands on index 2', () => {
    const state = createTurnState<P>(['p1', 'p2', 'p3', 'p4', 'p5'], 'a')
    const result = skipNext(state, 'b')
    expect(result).toEqual({
      playerOrder: ['p1', 'p2', 'p3', 'p4', 'p5'],
      currentIndex: 2,
      direction: 1,
      phase: 'b',
      turnNumber: 2,
    })
  })
})

// ---------------------------------------------------------------------------
// extraTurn
// ---------------------------------------------------------------------------

describe('extraTurn', () => {
  it('keeps currentIndex the same, updates phase, increments turnNumber', () => {
    const state = createTurnState<P>(['p1', 'p2', 'p3'], 'a')
    const result = extraTurn(state, 'b')
    expect(result.currentIndex).toBe(0)
    expect(result.phase).toBe('b')
    expect(result.turnNumber).toBe(2)
  })
})

// ---------------------------------------------------------------------------
// reverseDirection
// ---------------------------------------------------------------------------

describe('reverseDirection', () => {
  it('flips direction from 1 to -1 and back', () => {
    const state = createTurnState<P>(['p1', 'p2', 'p3'], 'a')
    const reversed = reverseDirection(state)
    expect(reversed.direction).toBe(-1)
    const reversedAgain = reverseDirection(reversed)
    expect(reversedAgain.direction).toBe(1)
  })

  it('does not change currentIndex, phase, or turnNumber', () => {
    const state: TurnState<P> = {
      playerOrder: ['p1', 'p2', 'p3'],
      currentIndex: 1,
      direction: 1,
      phase: 'a',
      turnNumber: 5,
    }
    const result = reverseDirection(state)
    expect(result.currentIndex).toBe(1)
    expect(result.phase).toBe('a')
    expect(result.turnNumber).toBe(5)
  })
})

// ---------------------------------------------------------------------------
// setPhase
// ---------------------------------------------------------------------------

describe('setPhase', () => {
  it('changes only phase; other fields unchanged', () => {
    const state: TurnState<P> = {
      playerOrder: ['p1', 'p2', 'p3'],
      currentIndex: 1,
      direction: 1,
      phase: 'a',
      turnNumber: 7,
    }
    const result = setPhase(state, 'b')
    expect(result.phase).toBe('b')
    expect(result.currentIndex).toBe(1)
    expect(result.direction).toBe(1)
    expect(result.turnNumber).toBe(7)
  })
})

// ---------------------------------------------------------------------------
// Single-player turn state
// ---------------------------------------------------------------------------

describe('single player', () => {
  it('advanceTurn, skipNext, and extraTurn keep currentIndex at 0 and increment turnNumber', () => {
    let state = createTurnState<P>(['solo'], 'a')
    expect(state.turnNumber).toBe(1)

    state = advanceTurn(state, 'a')
    expect(state.currentIndex).toBe(0)
    expect(currentPlayer(state)).toBe('solo')
    expect(state.turnNumber).toBe(2)

    state = skipNext(state, 'a')
    expect(state.currentIndex).toBe(0)
    expect(currentPlayer(state)).toBe('solo')
    expect(state.turnNumber).toBe(3)

    state = extraTurn(state, 'a')
    expect(state.currentIndex).toBe(0)
    expect(currentPlayer(state)).toBe('solo')
    expect(state.turnNumber).toBe(4)
  })
})

// ---------------------------------------------------------------------------
// Immutability
// ---------------------------------------------------------------------------

describe('immutability', () => {
  it('advanceTurn returns a new object and does not mutate input', () => {
    const state = createTurnState<P>(['p1', 'p2', 'p3'], 'a')
    const frozen = { ...state }
    const result = advanceTurn(state, 'b')
    expect(result).not.toBe(state)
    expect(state).toEqual(frozen)
  })

  it('skipNext returns a new object and does not mutate input', () => {
    const state = createTurnState<P>(['p1', 'p2', 'p3'], 'a')
    const frozen = { ...state }
    const result = skipNext(state, 'b')
    expect(result).not.toBe(state)
    expect(state).toEqual(frozen)
  })

  it('extraTurn returns a new object and does not mutate input', () => {
    const state = createTurnState<P>(['p1', 'p2', 'p3'], 'a')
    const frozen = { ...state }
    const result = extraTurn(state, 'b')
    expect(result).not.toBe(state)
    expect(state).toEqual(frozen)
  })

  it('reverseDirection returns a new object and does not mutate input', () => {
    const state = createTurnState<P>(['p1', 'p2', 'p3'], 'a')
    const frozen = { ...state }
    const result = reverseDirection(state)
    expect(result).not.toBe(state)
    expect(state).toEqual(frozen)
  })

  it('setPhase returns a new object and does not mutate input', () => {
    const state = createTurnState<P>(['p1', 'p2', 'p3'], 'a')
    const frozen = { ...state }
    const result = setPhase(state, 'b')
    expect(result).not.toBe(state)
    expect(state).toEqual(frozen)
  })
})

// ---------------------------------------------------------------------------
// Sequence test (realistic combined operations)
// ---------------------------------------------------------------------------

describe('sequence', () => {
  it('combines advanceTurn, reverseDirection, and extraTurn correctly', () => {
    let state: TurnState<'draw' | 'discard' | 'score'> = createTurnState(['p1', 'p2', 'p3', 'p4'], 'draw')

    // p1's turn (draw phase) — index 0, turn 1
    expect(currentPlayer(state)).toBe('p1')
    expect(state.turnNumber).toBe(1)

    // p1 advances to p2
    state = advanceTurn(state, 'draw')
    expect(currentPlayer(state)).toBe('p2')
    expect(state.turnNumber).toBe(2)

    // p2 advances to p3
    state = advanceTurn(state, 'draw')
    expect(currentPlayer(state)).toBe('p3')
    expect(state.turnNumber).toBe(3)

    // Reverse direction (now going backward: p3 -> p2 -> p1 -> p4)
    state = reverseDirection(state)
    expect(state.direction).toBe(-1)
    expect(currentPlayer(state)).toBe('p3') // still p3's turn
    expect(state.turnNumber).toBe(3) // no turn consumed

    // Advance backward: p3 -> p2
    state = advanceTurn(state, 'draw')
    expect(currentPlayer(state)).toBe('p2')
    expect(state.turnNumber).toBe(4)

    // p2 gets an extra turn (e.g. bonus)
    state = extraTurn(state, 'score')
    expect(currentPlayer(state)).toBe('p2')
    expect(state.phase).toBe('score')
    expect(state.turnNumber).toBe(5)

    // Advance backward again: p2 -> p1
    state = advanceTurn(state, 'discard')
    expect(currentPlayer(state)).toBe('p1')
    expect(state.turnNumber).toBe(6)
    expect(state.direction).toBe(-1)
  })
})

// ---------------------------------------------------------------------------
// Different phase types (proves genericity / no hardcoded assumptions)
// ---------------------------------------------------------------------------

describe('different phase types', () => {
  it('works with a simple two-value phase type', () => {
    type SimplePhase = 'a' | 'b'
    const state = createTurnState<SimplePhase>(['p1', 'p2'], 'a')
    expect(state.phase).toBe('a')
    const next = setPhase(state, 'b')
    expect(next.phase).toBe('b')
  })

  it('works with a completely different phase set', () => {
    type GamePhase = 'draw' | 'discard' | 'score'
    const state = createTurnState<GamePhase>(['p1', 'p2', 'p3'], 'draw')
    const next = advanceTurn(state, 'discard')
    expect(next.phase).toBe('discard')
    // demonstrate that the engine doesn't care about the specific strings
    expect(next.currentIndex).toBe(1)
  })
})
