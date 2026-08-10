import { describe, expect, it } from 'vitest'
import { createRng } from '../../engine/rng.ts'
import { createHostSession, deriveSnapshot, isJsonSerializable } from '../../engine/sync.ts'
import { createTurnState, currentPlayer } from '../../engine/turn-engine.ts'
import {
  absoluteIndex,
  createWahooGame,
  legalMoves,
  type MarblePos,
  type WahooEvent,
  type WahooPrivateState,
  type WahooPublicState,
  type WahooSession,
} from './state.ts'
import { applyWahooAction, runWahooBotTurn } from './rules.ts'
import { wahooBotStrategy } from './bot.ts'

function buildWahoo(config: {
  playerIds?: string[]
  seatArms?: Record<string, number>
  positions?: Record<string, MarblePos[]>
  stage?: 'play' | 'over'
  phase?: 'roll' | 'move'
  currentIndex?: number
  die?: number | null
  sixStreak?: number
  centerBy?: WahooPublicState['centerBy']
  lastMoved?: WahooPublicState['lastMoved']
  lastEvent?: WahooEvent | null
  winnerId?: string | null
  mutedArm?: number | null
  rngSeed?: number
}): WahooSession {
  const playerIds = config.playerIds ?? ['p1', 'p2']
  const turn = createTurnState<'roll' | 'move'>(playerIds, config.phase ?? 'roll')
  if (config.currentIndex != null) {
    // createTurnState starts at index 0; advance to the desired index directly
    ;(turn as { currentIndex: number }).currentIndex = config.currentIndex
  }
  const defaults: Record<string, MarblePos[]> = {}
  for (const p of playerIds) defaults[p] = [-1, -1, -1, -1]
  const publicState: WahooPublicState = {
    stage: config.stage ?? 'play',
    turn,
    seatArms: config.seatArms ?? { p1: 0, p2: 2 },
    positions: config.positions ?? defaults,
    centerBy: config.centerBy ?? null,
    die: config.die ?? null,
    sixStreak: config.sixStreak ?? 0,
    lastMoved: config.lastMoved ?? null,
    lastEvent: config.lastEvent ?? null,
    winnerId: config.winnerId ?? null,
    mutedArm: config.mutedArm ?? null,
  }
  const privateStates: Record<string, WahooPrivateState> = {}
  for (const p of playerIds) privateStates[p] = {}
  return { session: createHostSession(publicState, privateStates), rng: createRng(config.rngSeed ?? 0) }
}

describe('createWahooGame', () => {
  it('2 players sit on opposite arms with fresh positions and a roll phase', () => {
    for (let seed = 0; seed < 20; seed++) {
      const pub = createWahooGame(['p1', 'p2'], seed).session.publicState
      expect(Math.abs(pub.seatArms['p1'] - pub.seatArms['p2'])).toBe(2)
      expect(pub.mutedArm).toBeNull()
      expect(pub.turn.playerOrder).toEqual(['p1', 'p2'])
      expect(pub.turn.phase).toBe('roll')
      expect(pub.stage).toBe('play')
      expect(pub.positions['p1']).toEqual([-1, -1, -1, -1])
      expect(pub.positions['p2']).toEqual([-1, -1, -1, -1])
      expect(pub.die).toBeNull()
      expect(pub.sixStreak).toBe(0)
      expect(pub.centerBy).toBeNull()
      expect(pub.lastMoved).toBeNull()
      expect(pub.lastEvent).toBeNull()
      expect(pub.winnerId).toBeNull()
    }
    // deterministic per seed
    expect(createWahooGame(['p1', 'p2'], 7).session.publicState).toEqual(
      createWahooGame(['p1', 'p2'], 7).session.publicState,
    )
  })

  it('3 players drop one random arm into mutedArm and keep three distinct arms', () => {
    for (let seed = 0; seed < 20; seed++) {
      const pub = createWahooGame(['p1', 'p2', 'p3'], seed).session.publicState
      expect(pub.mutedArm).not.toBeNull()
      const arms = [pub.seatArms['p1'], pub.seatArms['p2'], pub.seatArms['p3']]
      expect(new Set(arms).size).toBe(3)
      expect(arms.every((a) => a >= 0 && a <= 3)).toBe(true)
      expect(arms).not.toContain(pub.mutedArm)
      expect(pub.positions['p3']).toEqual([-1, -1, -1, -1])
    }
    expect(createWahooGame(['p1', 'p2', 'p3'], 7).session.publicState).toEqual(
      createWahooGame(['p1', 'p2', 'p3'], 7).session.publicState,
    )
  })

  it('4 players take all four arms', () => {
    for (let seed = 0; seed < 20; seed++) {
      const pub = createWahooGame(['p1', 'p2', 'p3', 'p4'], seed).session.publicState
      expect(pub.mutedArm).toBeNull()
      const arms = [pub.seatArms['p1'], pub.seatArms['p2'], pub.seatArms['p3'], pub.seatArms['p4']]
      expect([...arms].sort((a, b) => a - b)).toEqual([0, 1, 2, 3])
      expect(pub.turn.playerOrder).toEqual(['p1', 'p2', 'p3', 'p4'])
    }
    expect(createWahooGame(['p1', 'p2', 'p3', 'p4'], 7).session.publicState).toEqual(
      createWahooGame(['p1', 'p2', 'p3', 'p4'], 7).session.publicState,
    )
  })
})

describe('turn and phase gating', () => {
  it('rejects ROLL and MOVE out of turn', () => {
    const wh = buildWahoo({ phase: 'roll' })
    const r = applyWahooAction(wh, 'p2', { type: 'ROLL' })
    expect(r.outcome.ok).toBe(false)
    expect(r.outcome.reason).toContain('not your turn')

    const wh2 = buildWahoo({ phase: 'move', die: 6, positions: { p1: [5, -1, -1, -1], p2: [-1, -1, -1, -1] } })
    const m = applyWahooAction(wh2, 'p2', { type: 'MOVE', move: { marbleIdx: 0, kind: 'advance' } })
    expect(m.outcome.ok).toBe(false)
    expect(m.outcome.reason).toContain('not your turn')
  })

  it('rejects ROLL during the move phase and MOVE during the roll phase', () => {
    const wh1 = buildWahoo({ phase: 'move', die: 3 })
    const r = applyWahooAction(wh1, 'p1', { type: 'ROLL' })
    expect(r.outcome.ok).toBe(false)
    expect(r.outcome.reason).toContain('already rolled')

    const wh2 = buildWahoo({ phase: 'roll' })
    const m = applyWahooAction(wh2, 'p1', { type: 'MOVE', move: { marbleIdx: 0, kind: 'out' } })
    expect(m.outcome.ok).toBe(false)
    expect(m.outcome.reason).toContain('roll first')
  })

  it('rejects a MOVE that is not in legalMoves (wrong marble, wrong kind)', () => {
    const wh = buildWahoo({ phase: 'move', die: 3, positions: { p1: [5, -1, -1, -1], p2: [-1, -1, -1, -1] } })
    expect(legalMoves(wh.session.publicState, 'p1', 3)).toEqual([{ marbleIdx: 0, kind: 'advance' }])

    // wrong marble: marble 1 is in base, so advancing it is not legal
    const bad1 = applyWahooAction(wh, 'p1', { type: 'MOVE', move: { marbleIdx: 1, kind: 'advance' } })
    expect(bad1.outcome.ok).toBe(false)
    expect(bad1.outcome.reason).toContain('not a legal move')

    // wrong kinds for a track marble
    for (const kind of ['out', 'shortcut', 'exit'] as const) {
      const bad = applyWahooAction(wh, 'p1', { type: 'MOVE', move: { marbleIdx: 0, kind } })
      expect(bad.outcome.ok).toBe(false)
      expect(bad.outcome.reason).toContain('not a legal move')
    }
  })
})

describe('out', () => {
  it('brings a marble out on a 1 or 6 but not other dice', () => {
    let wh = buildWahoo({ phase: 'move', die: 1, positions: { p1: [-1, -1, -1, -1], p2: [-1, -1, -1, -1] } })
    let r = applyWahooAction(wh, 'p1', { type: 'MOVE', move: { marbleIdx: 0, kind: 'out' } })
    expect(r.outcome.ok).toBe(true)
    let pub = r.wh.session.publicState
    expect(pub.positions['p1']).toEqual([0, -1, -1, -1])
    expect(pub.lastEvent).toEqual({ kind: 'out', by: 'p1', bumpedId: null })

    wh = buildWahoo({ phase: 'move', die: 6, positions: { p1: [-1, 5, -1, -1], p2: [-1, -1, -1, -1] } })
    r = applyWahooAction(wh, 'p1', { type: 'MOVE', move: { marbleIdx: 0, kind: 'out' } })
    expect(r.outcome.ok).toBe(true)
    pub = r.wh.session.publicState
    expect(pub.positions['p1']).toEqual([0, 5, -1, -1])

    // die 3: no out move is offered at all
    const wh3 = buildWahoo({ phase: 'move', die: 3, positions: { p1: [-1, -1, -1, -1], p2: [-1, -1, -1, -1] } })
    expect(legalMoves(wh3.session.publicState, 'p1', 3)).toEqual([])
    const bad = applyWahooAction(wh3, 'p1', { type: 'MOVE', move: { marbleIdx: 0, kind: 'out' } })
    expect(bad.outcome.ok).toBe(false)
  })

  it('is blocked when an own marble sits on the entry hole', () => {
    const wh = buildWahoo({ phase: 'move', die: 1, positions: { p1: [0, -1, -1, -1], p2: [-1, -1, -1, -1] } })
    expect(legalMoves(wh.session.publicState, 'p1', 1).some((m) => m.kind === 'out')).toBe(false)
    const r = applyWahooAction(wh, 'p1', { type: 'MOVE', move: { marbleIdx: 1, kind: 'out' } })
    expect(r.outcome.ok).toBe(false)
  })

  it('bumps an opponent sitting on the entry hole', () => {
    // p2 (arm 2) at rel 26 sits on absolute 10 — p1's come-out hole.
    const wh = buildWahoo({
      phase: 'move',
      die: 6,
      positions: { p1: [-1, -1, -1, -1], p2: [26, 5, -1, -1] },
    })
    const r = applyWahooAction(wh, 'p1', { type: 'MOVE', move: { marbleIdx: 1, kind: 'out' } })
    expect(r.outcome.ok).toBe(true)
    const pub = r.wh.session.publicState
    expect(pub.positions['p1']).toEqual([-1, 0, -1, -1])
    expect(pub.positions['p2']).toEqual([-1, 5, -1, -1])
    expect(pub.lastEvent).toEqual({ kind: 'out', by: 'p1', bumpedId: 'p2' })
  })
})

describe('advance', () => {
  it('lands exactly on pos + die and passes the turn', () => {
    const wh = buildWahoo({ phase: 'move', die: 3, positions: { p1: [5, -1, -1, -1], p2: [-1, -1, -1, -1] } })
    const r = applyWahooAction(wh, 'p1', { type: 'MOVE', move: { marbleIdx: 0, kind: 'advance' } })
    expect(r.outcome.ok).toBe(true)
    const pub = r.wh.session.publicState
    expect(pub.positions['p1']).toEqual([8, -1, -1, -1])
    expect(pub.lastEvent).toEqual({ kind: 'move', by: 'p1', marbleIdx: 0, bumpedId: null })
    expect(pub.die).toBeNull()
    expect(pub.turn.phase).toBe('roll')
    expect(currentPlayer(pub.turn)).toBe('p2')
    expect(pub.turn.turnNumber).toBe(2)
  })

  it('is blocked by an own marble at the landing', () => {
    const wh = buildWahoo({ phase: 'move', die: 3, positions: { p1: [5, 8, -1, -1], p2: [-1, -1, -1, -1] } })
    expect(legalMoves(wh.session.publicState, 'p1', 3)).toEqual([{ marbleIdx: 1, kind: 'advance' }])
    const r = applyWahooAction(wh, 'p1', { type: 'MOVE', move: { marbleIdx: 0, kind: 'advance' } })
    expect(r.outcome.ok).toBe(false)
  })

  it('detects cross-seat collisions in absolute terms and bumps the opponent', () => {
    // p1 (arm 0) rel 12 and p2 (arm 2) rel 38 both sit on absolute 22 — they
    // collide absolutely but not relatively.
    expect(absoluteIndex({ p1: 0, p2: 2 }, 'p2', 38)).toBe(22)
    const wh = buildWahoo({
      phase: 'move',
      die: 1,
      currentIndex: 1,
      positions: { p1: [12, -1, -1, -1], p2: [37, 20, -1, -1] },
    })
    const r = applyWahooAction(wh, 'p2', { type: 'MOVE', move: { marbleIdx: 0, kind: 'advance' } })
    expect(r.outcome.ok).toBe(true)
    const pub = r.wh.session.publicState
    expect(pub.positions['p2']).toEqual([38, 20, -1, -1])
    expect(pub.positions['p1']).toEqual([-1, -1, -1, -1]) // bumped back to base
    expect(pub.lastEvent).toEqual({ kind: 'move', by: 'p2', marbleIdx: 0, bumpedId: 'p1' })
  })
})

describe('home lane', () => {
  it('enters the lane with an exact count', () => {
    let wh = buildWahoo({ phase: 'move', die: 1, positions: { p1: [51, -1, -1, -1], p2: [-1, -1, -1, -1] } })
    let r = applyWahooAction(wh, 'p1', { type: 'MOVE', move: { marbleIdx: 0, kind: 'advance' } })
    expect(r.outcome.ok).toBe(true)
    expect(r.wh.session.publicState.positions['p1'][0]).toBe(52)

    wh = buildWahoo({ phase: 'move', die: 2, positions: { p1: [50, -1, -1, -1], p2: [-1, -1, -1, -1] } })
    r = applyWahooAction(wh, 'p1', { type: 'MOVE', move: { marbleIdx: 0, kind: 'advance' } })
    expect(r.outcome.ok).toBe(true)
    expect(r.wh.session.publicState.positions['p1'][0]).toBe(52)
  })

  it('rejects overshoot past 55', () => {
    const wh = buildWahoo({ phase: 'move', die: 6, positions: { p1: [51, -1, -1, -1], p2: [-1, -1, -1, -1] } })
    expect(legalMoves(wh.session.publicState, 'p1', 6).some((m) => m.kind === 'advance')).toBe(false)
    const r = applyWahooAction(wh, 'p1', { type: 'MOVE', move: { marbleIdx: 0, kind: 'advance' } })
    expect(r.outcome.ok).toBe(false)
  })

  it('enforces the no-pass rule inside the lane', () => {
    // entry onto an occupied lane slot is blocked
    let wh = buildWahoo({ phase: 'move', die: 1, positions: { p1: [51, 52, -1, -1], p2: [-1, -1, -1, -1] } })
    expect(legalMoves(wh.session.publicState, 'p1', 1).some((m) => m.kind === 'advance' && m.marbleIdx === 0)).toBe(false)
    let r = applyWahooAction(wh, 'p1', { type: 'MOVE', move: { marbleIdx: 0, kind: 'advance' } })
    expect(r.outcome.ok).toBe(false)

    // passing a lane marble is blocked even with room ahead
    wh = buildWahoo({ phase: 'move', die: 2, positions: { p1: [52, 54, -1, -1], p2: [-1, -1, -1, -1] } })
    expect(legalMoves(wh.session.publicState, 'p1', 2)).toEqual([])
    r = applyWahooAction(wh, 'p1', { type: 'MOVE', move: { marbleIdx: 0, kind: 'advance' } })
    expect(r.outcome.ok).toBe(false)
  })

  it('advances within the lane by exact count', () => {
    let wh = buildWahoo({ phase: 'move', die: 2, positions: { p1: [52, -1, -1, -1], p2: [-1, -1, -1, -1] } })
    let r = applyWahooAction(wh, 'p1', { type: 'MOVE', move: { marbleIdx: 0, kind: 'advance' } })
    expect(r.outcome.ok).toBe(true)
    expect(r.wh.session.publicState.positions['p1'][0]).toBe(54)

    wh = buildWahoo({ phase: 'move', die: 1, positions: { p1: [53, 54, -1, -1], p2: [-1, -1, -1, -1] } })
    expect(legalMoves(wh.session.publicState, 'p1', 1).some((m) => m.kind === 'advance' && m.marbleIdx === 0)).toBe(false)
    r = applyWahooAction(wh, 'p1', { type: 'MOVE', move: { marbleIdx: 0, kind: 'advance' } })
    expect(r.outcome.ok).toBe(false)
  })

  it('fills the lane back-to-front: 55, 54, 53, 52', () => {
    let positions: Record<string, MarblePos[]> = { p1: [51, 51, 51, 51], p2: [-1, -1, -1, -1] }
    for (const [marbleIdx, die] of [[0, 4], [1, 3], [2, 2], [3, 1]] as const) {
      const wh = buildWahoo({ phase: 'move', die, positions })
      const r = applyWahooAction(wh, 'p1', { type: 'MOVE', move: { marbleIdx, kind: 'advance' } })
      expect(r.outcome.ok).toBe(true)
      positions = r.wh.session.publicState.positions
    }
    expect(positions['p1']).toEqual([55, 54, 53, 52])
  })
})

describe('shortcut', () => {
  it('offers the corner jump from p=10 with die 6 via corner 15', () => {
    const wh = buildWahoo({ phase: 'move', die: 6, positions: { p1: [10, -1, -1, -1], p2: [-1, -1, -1, -1] } })
    expect(legalMoves(wh.session.publicState, 'p1', 6)).toContainEqual({ marbleIdx: 0, kind: 'shortcut' })
    const r = applyWahooAction(wh, 'p1', { type: 'MOVE', move: { marbleIdx: 0, kind: 'shortcut' } })
    expect(r.outcome.ok).toBe(true)
    const pub = r.wh.session.publicState
    expect(pub.positions['p1']).toEqual([-2, -1, -1, -1])
    expect(pub.centerBy).toEqual({ playerId: 'p1', marbleIdx: 0, entryCornerRel: 15 })
    expect(pub.lastEvent).toEqual({ kind: 'shortcut', by: 'p1', bumpedId: null })
  })

  it('never offers the 28/41 corners as shortcut entries', () => {
    // p=26 die 3: (28 − 26) + 1 = 3 would fit if 28 were a shortcut corner
    let wh = buildWahoo({ phase: 'move', die: 3, positions: { p1: [26, -1, -1, -1], p2: [-1, -1, -1, -1] } })
    let moves = legalMoves(wh.session.publicState, 'p1', 3)
    expect(moves.some((m) => m.kind === 'shortcut')).toBe(false)
    // p=39 die 3: (41 − 39) + 1 = 3
    wh = buildWahoo({ phase: 'move', die: 3, positions: { p1: [39, -1, -1, -1], p2: [-1, -1, -1, -1] } })
    moves = legalMoves(wh.session.publicState, 'p1', 3)
    expect(moves.some((m) => m.kind === 'shortcut')).toBe(false)
  })

  it('is illegal when the center holds an own marble', () => {
    const wh = buildWahoo({
      phase: 'move',
      die: 3,
      positions: { p1: [0, -2, -1, -1], p2: [-1, -1, -1, -1] },
      centerBy: { playerId: 'p1', marbleIdx: 1, entryCornerRel: 15 },
    })
    expect(legalMoves(wh.session.publicState, 'p1', 3).some((m) => m.kind === 'shortcut')).toBe(false)
    const r = applyWahooAction(wh, 'p1', { type: 'MOVE', move: { marbleIdx: 0, kind: 'shortcut' } })
    expect(r.outcome.ok).toBe(false)
  })

  it('bumps an opponent out of the center and takes it over', () => {
    const wh = buildWahoo({
      phase: 'move',
      die: 3,
      positions: { p1: [0, -1, -1, -1], p2: [-2, -1, -1, -1] },
      centerBy: { playerId: 'p2', marbleIdx: 0, entryCornerRel: 15 },
    })
    const r = applyWahooAction(wh, 'p1', { type: 'MOVE', move: { marbleIdx: 0, kind: 'shortcut' } })
    expect(r.outcome.ok).toBe(true)
    const pub = r.wh.session.publicState
    expect(pub.positions['p1']).toEqual([-2, -1, -1, -1])
    expect(pub.positions['p2']).toEqual([-1, -1, -1, -1]) // bumped back to base
    expect(pub.centerBy).toEqual({ playerId: 'p1', marbleIdx: 0, entryCornerRel: 2 })
    expect(pub.lastEvent).toEqual({ kind: 'shortcut', by: 'p1', bumpedId: 'p2' })
  })
})

describe('exit', () => {
  it('requires a 1 or 6', () => {
    const wh = buildWahoo({
      phase: 'move',
      die: 3,
      positions: { p1: [-2, -1, -1, -1], p2: [-1, -1, -1, -1] },
      centerBy: { playerId: 'p1', marbleIdx: 0, entryCornerRel: 2 },
    })
    expect(legalMoves(wh.session.publicState, 'p1', 3).some((m) => m.kind === 'exit')).toBe(false)
    const r = applyWahooAction(wh, 'p1', { type: 'MOVE', move: { marbleIdx: 0, kind: 'exit' } })
    expect(r.outcome.ok).toBe(false)
  })

  it('lands on the diagonal corner: entry 2 → rel 28, entry 15 → rel 41', () => {
    let wh = buildWahoo({
      phase: 'move',
      die: 1,
      positions: { p1: [-2, -1, -1, -1], p2: [-1, -1, -1, -1] },
      centerBy: { playerId: 'p1', marbleIdx: 0, entryCornerRel: 2 },
    })
    let r = applyWahooAction(wh, 'p1', { type: 'MOVE', move: { marbleIdx: 0, kind: 'exit' } })
    expect(r.outcome.ok).toBe(true)
    let pub = r.wh.session.publicState
    expect(pub.positions['p1']).toEqual([28, -1, -1, -1])
    expect(pub.centerBy).toBeNull()
    expect(pub.lastEvent).toEqual({ kind: 'exit', by: 'p1', bumpedId: null })

    wh = buildWahoo({
      phase: 'move',
      die: 6,
      positions: { p1: [-2, -1, -1, -1], p2: [-1, -1, -1, -1] },
      centerBy: { playerId: 'p1', marbleIdx: 0, entryCornerRel: 15 },
    })
    r = applyWahooAction(wh, 'p1', { type: 'MOVE', move: { marbleIdx: 0, kind: 'exit' } })
    expect(r.outcome.ok).toBe(true)
    pub = r.wh.session.publicState
    expect(pub.positions['p1']).toEqual([41, -1, -1, -1])
    expect(pub.centerBy).toBeNull()
  })

  it('is blocked by an own marble on the target corner', () => {
    const wh = buildWahoo({
      phase: 'move',
      die: 1,
      positions: { p1: [-2, 28, -1, -1], p2: [-1, -1, -1, -1] },
      centerBy: { playerId: 'p1', marbleIdx: 0, entryCornerRel: 2 },
    })
    expect(legalMoves(wh.session.publicState, 'p1', 1).some((m) => m.kind === 'exit')).toBe(false)
    const r = applyWahooAction(wh, 'p1', { type: 'MOVE', move: { marbleIdx: 0, kind: 'exit' } })
    expect(r.outcome.ok).toBe(false)
  })

  it('bumps an opponent on the target corner', () => {
    // p1 (arm 0) exits entry 2 → rel 28 = abs (10+28)%52 = 38. p2 (arm 2) at
    // rel 2 sits on the same absolute hole: (26+10+2)%52 = 38.
    const wh = buildWahoo({
      phase: 'move',
      die: 1,
      positions: { p1: [-2, -1, -1, -1], p2: [2, -1, -1, -1] },
      centerBy: { playerId: 'p1', marbleIdx: 0, entryCornerRel: 2 },
    })
    const r = applyWahooAction(wh, 'p1', { type: 'MOVE', move: { marbleIdx: 0, kind: 'exit' } })
    expect(r.outcome.ok).toBe(true)
    const pub = r.wh.session.publicState
    expect(pub.positions['p1']).toEqual([28, -1, -1, -1])
    expect(pub.positions['p2']).toEqual([-1, -1, -1, -1])
    expect(pub.lastEvent).toEqual({ kind: 'exit', by: 'p1', bumpedId: 'p2' })
  })
})

describe('six chain', () => {
  it('roll 6 + move grants an extra roll; the third consecutive 6 busts the moved marble', () => {
    // seed 749: the first three host rolls are all 6
    let wh = buildWahoo({ phase: 'roll', rngSeed: 749, positions: { p1: [5, -1, -1, -1], p2: [-1, -1, -1, -1] } })
    for (let i = 1; i <= 3; i++) {
      let r = applyWahooAction(wh, 'p1', { type: 'ROLL' })
      expect(r.outcome.ok).toBe(true)
      wh = r.wh
      let pub = wh.session.publicState
      expect(pub.die).toBe(6)
      expect(pub.turn.phase).toBe('move')
      expect(pub.lastEvent).toEqual({ kind: 'roll', by: 'p1', die: 6 })

      r = applyWahooAction(wh, 'p1', { type: 'MOVE', move: { marbleIdx: 0, kind: 'advance' } })
      expect(r.outcome.ok).toBe(true)
      wh = r.wh
      pub = wh.session.publicState
      expect(pub.lastMoved).toEqual({ playerId: 'p1', marbleIdx: 0 })
      if (i < 3) {
        expect(pub.sixStreak).toBe(i)
        expect(pub.die).toBeNull()
        expect(pub.turn.phase).toBe('roll')
        expect(currentPlayer(pub.turn)).toBe('p1') // extra roll for the same player
        expect(pub.turn.turnNumber).toBe(i + 1)
        expect(pub.positions['p1'][0]).toBe(5 + 6 * i)
      } else {
        expect(pub.sixStreak).toBe(0)
        expect(pub.die).toBeNull()
        expect(pub.positions['p1'][0]).toBe(-1) // busted back to base
        expect(pub.turn.phase).toBe('roll')
        expect(currentPlayer(pub.turn)).toBe('p2') // turn passes
        expect(pub.turn.turnNumber).toBe(4)
        expect(pub.lastEvent).toEqual({ kind: 'bust', by: 'p1' })
      }
    }
  })

  it('a 6 with no legal move is a pass: streak dies, no extra roll', () => {
    // marble at 46 wants 52 but the lane slot is occupied; every lane marble
    // overshoots with a 6, nothing is in base or the center — no legal moves.
    const wh = buildWahoo({
      phase: 'roll',
      rngSeed: 4, // first roll is a 6
      sixStreak: 2,
      positions: { p1: [46, 52, 53, 55], p2: [-1, -1, -1, -1] },
    })
    expect(legalMoves(wh.session.publicState, 'p1', 6)).toEqual([])
    const r = applyWahooAction(wh, 'p1', { type: 'ROLL' })
    expect(r.outcome.ok).toBe(true)
    const pub = r.wh.session.publicState
    expect(pub.lastEvent).toEqual({ kind: 'pass', by: 'p1' })
    expect(pub.die).toBeNull()
    expect(pub.sixStreak).toBe(0)
    expect(pub.turn.phase).toBe('roll')
    expect(currentPlayer(pub.turn)).toBe('p2')
    expect(pub.turn.turnNumber).toBe(2)
  })
})

describe('pass', () => {
  it('any roll with no legal move emits pass, advances the turn, and clears the die', () => {
    // all four marbles in the lane: no advance fits, nothing else applies
    const wh = buildWahoo({
      phase: 'roll',
      rngSeed: 0, // first roll is a 2
      positions: { p1: [52, 53, 54, 55], p2: [-1, -1, -1, -1] },
    })
    const r = applyWahooAction(wh, 'p1', { type: 'ROLL' })
    expect(r.outcome.ok).toBe(true)
    const pub = r.wh.session.publicState
    expect(pub.lastEvent).toEqual({ kind: 'pass', by: 'p1' })
    expect(pub.die).toBeNull()
    expect(pub.turn.phase).toBe('roll')
    expect(currentPlayer(pub.turn)).toBe('p2')
    expect(pub.turn.turnNumber).toBe(2)
  })
})

describe('win', () => {
  it('ends the game when the fourth marble reaches the lane; further actions rejected', () => {
    const wh = buildWahoo({ phase: 'move', die: 1, positions: { p1: [51, 53, 54, 55], p2: [-1, -1, -1, -1] } })
    const r = applyWahooAction(wh, 'p1', { type: 'MOVE', move: { marbleIdx: 0, kind: 'advance' } })
    expect(r.outcome.ok).toBe(true)
    const pub = r.wh.session.publicState
    expect(pub.stage).toBe('over')
    expect(pub.winnerId).toBe('p1')
    expect(pub.positions['p1']).toEqual([52, 53, 54, 55])
    expect(pub.lastEvent).toEqual({ kind: 'win', by: 'p1' })

    for (const playerId of ['p1', 'p2']) {
      const post = applyWahooAction(r.wh, playerId, { type: 'ROLL' })
      expect(post.outcome.ok).toBe(false)
      expect(post.outcome.reason).toContain('game over')
    }
  })

  it('the win fires before a would-be triple-six bust', () => {
    const wh = buildWahoo({
      phase: 'move',
      die: 6,
      sixStreak: 2,
      positions: { p1: [46, 53, 54, 55], p2: [-1, -1, -1, -1] },
    })
    const r = applyWahooAction(wh, 'p1', { type: 'MOVE', move: { marbleIdx: 0, kind: 'advance' } })
    expect(r.outcome.ok).toBe(true)
    const pub = r.wh.session.publicState
    expect(pub.stage).toBe('over')
    expect(pub.winnerId).toBe('p1')
    expect(pub.positions['p1'][0]).toBe(52) // NOT busted back to base
    expect(pub.lastEvent).toEqual({ kind: 'win', by: 'p1' })
  })
})

describe('full bot games', () => {
  const runGame = (wh: WahooSession): WahooSession => {
    let actions = 0
    while (wh.session.publicState.stage !== 'over') {
      const playerId = currentPlayer(wh.session.publicState.turn)
      const r = runWahooBotTurn(wh, playerId, wahooBotStrategy)
      expect(r.outcome.ok).toBe(true)
      wh = r.wh
      actions++
      expect(actions).toBeLessThanOrEqual(5000)
    }
    return wh
  }

  const expectWinner = (wh: WahooSession): void => {
    const pub = wh.session.publicState
    expect(pub.winnerId).not.toBeNull()
    expect(pub.positions[pub.winnerId!].every((p) => p >= 52)).toBe(true)
    expect(pub.stage).toBe('over')
  }

  it('2 seats terminate with a winner', () => {
    expectWinner(runGame(createWahooGame(['p1', 'p2'], 7)))
  })

  it('3 seats terminate with a winner', () => {
    expectWinner(runGame(createWahooGame(['p1', 'p2', 'p3'], 11)))
  })

  it('4 seats terminate with a winner', () => {
    expectWinner(runGame(createWahooGame(['p1', 'p2', 'p3', 'p4'], 23)))
  })
})

describe('serialization', () => {
  it('revision +1 per accepted action; every player snapshot is json-serializable', () => {
    const playerIds = ['p1', 'p2', 'p3']
    let wh = buildWahoo({
      playerIds,
      seatArms: { p1: 0, p2: 1, p3: 2 },
      phase: 'move',
      die: 1,
      positions: { p1: [-1, -1, -1, -1], p2: [-1, -1, -1, -1], p3: [-1, -1, -1, -1] },
    })
    expect(wh.session.revision).toBe(0)

    // rejected actions do not bump the revision (or consume the rng)
    const bad = applyWahooAction(wh, 'p1', { type: 'ROLL' })
    expect(bad.outcome.ok).toBe(false)
    expect(bad.wh.session.revision).toBe(0)

    // accepted: p1 brings a marble out
    let r = applyWahooAction(wh, 'p1', { type: 'MOVE', move: { marbleIdx: 0, kind: 'out' } })
    expect(r.outcome.ok).toBe(true)
    wh = r.wh
    expect(wh.session.revision).toBe(1)

    // accepted: p2 rolls (seed 0 → die 2, all marbles in base → pass)
    r = applyWahooAction(wh, 'p2', { type: 'ROLL' })
    expect(r.outcome.ok).toBe(true)
    wh = r.wh
    expect(wh.session.revision).toBe(2)

    // accepted: p3 rolls; take the move if one exists
    r = applyWahooAction(wh, currentPlayer(wh.session.publicState.turn), { type: 'ROLL' })
    expect(r.outcome.ok).toBe(true)
    wh = r.wh
    expect(wh.session.revision).toBe(3)
    if (wh.session.publicState.turn.phase === 'move') {
      const pid = currentPlayer(wh.session.publicState.turn)
      const moves = legalMoves(wh.session.publicState, pid, wh.session.publicState.die!)
      r = applyWahooAction(wh, pid, { type: 'MOVE', move: moves[0] })
      expect(r.outcome.ok).toBe(true)
      wh = r.wh
      expect(wh.session.revision).toBe(4)
    }

    for (const playerId of playerIds) {
      const snapshot = deriveSnapshot(wh.session, playerId)
      expect(isJsonSerializable(snapshot)).toBe(true)
      expect(snapshot.privateState).toEqual({})
      expect(JSON.parse(JSON.stringify(snapshot.publicState))).toEqual(snapshot.publicState)
    }
  })
})
