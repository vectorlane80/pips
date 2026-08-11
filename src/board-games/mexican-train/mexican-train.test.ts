import { describe, expect, it } from 'vitest'
import {
  MT_ENGINE_SEQ,
  createMexicanTrainGame,
  createMexicanTrainSet,
  dealMTRound,
  handHasLegalPlay,
  laneEnd,
  legalLanes,
  type LastMTAction,
  type MTLaneKey,
  type MTPlacedTile,
  type MTPrivateState,
  type MTPublicState,
  type MTRoundResult,
  type MTSession,
  type MTTile,
} from './state.ts'
import { applyMTAction, runMTBotTurn } from './rules.ts'
import { mexicanTrainBotStrategy } from './bot.ts'
import { assertWireSafe, createHostSession, deriveSnapshot, isJsonSerializable } from '../../engine/sync.ts'
import { createTurnState, currentPlayer } from '../../engine/turn-engine.ts'
import { createRng } from '../../engine/rng.ts'
import { addCards, cardCount, createHand, createPublicZone } from '../../card-engine/zones.ts'

const PLAYERS: [string, string, string, string] = ['p1', 'p2', 'p3', 'p4']
const emptyTrains = (): Record<MTLaneKey, MTPlacedTile[]> => ({ p0: [], p1: [], p2: [], p3: [], mex: [] })
const emptyOpen = (): Record<'p0' | 'p1' | 'p2' | 'p3', boolean> => ({ p0: false, p1: false, p2: false, p3: false })
const zeroScores = (): Record<string, number> => ({ p1: 0, p2: 0, p3: 0, p4: 0 })

function tile(a: number, b: number): MTTile {
  const lo = Math.min(a, b)
  const hi = Math.max(a, b)
  return { id: `${lo}-${hi}`, a: lo, b: hi }
}

function tiles(pairs: [number, number][]): MTTile[] {
  return pairs.map(([a, b]) => tile(a, b))
}

function placed(inner: number, outer: number, isDouble = false): MTPlacedTile {
  return { inner, outer, isDouble }
}

// Hand-built session with a known board, hands, and boneyard (dominoes-test style).
function buildGame(config: {
  stage?: MTPublicState['stage']
  currentIndex?: number
  round?: number
  engine?: number
  trains?: Partial<Record<MTLaneKey, MTPlacedTile[]>>
  open?: Partial<Record<'p0' | 'p1' | 'p2' | 'p3', boolean>>
  hands?: Record<string, MTTile[]>
  boneyard?: MTTile[]
  scores?: Record<string, number>
  doublePending?: boolean
  passStreak?: number
  roundResult?: MTRoundResult | null
  matchWinnerId?: string | null
  lastAction?: LastMTAction | null
} = {}): MTSession {
  const turn = createTurnState<'play'>(PLAYERS, 'play')
  if (config.currentIndex != null) {
    ;(turn as { currentIndex: number }).currentIndex = config.currentIndex
  }
  const hands = config.hands ?? {
    p1: tiles([[1, 1], [2, 2], [3, 3], [4, 4]]),
    p2: tiles([[1, 2], [2, 3], [3, 4], [4, 5]]),
    p3: tiles([[0, 1], [0, 2], [0, 3], [0, 4]]),
    p4: tiles([[5, 5], [6, 6], [7, 7], [8, 8]]),
  }
  const privateStates: Record<string, MTPrivateState> = {}
  const handCounts: Record<string, number> = {}
  for (const p of PLAYERS) {
    privateStates[p] = { hand: addCards(createHand<MTTile>(p), hands[p]) }
    handCounts[p] = hands[p].length
  }
  const boneyard = addCards(createPublicZone<MTTile>('boneyard', 'private'), config.boneyard ?? [])
  const publicState: MTPublicState = {
    stage: config.stage ?? 'play',
    turn,
    seatOrder: PLAYERS,
    round: config.round ?? 0,
    engine: config.engine ?? 12,
    trains: { ...emptyTrains(), ...config.trains },
    open: { ...emptyOpen(), ...config.open },
    boneyardCount: boneyard.cards.length,
    handCounts,
    doublePending: config.doublePending ?? false,
    passStreak: config.passStreak ?? 0,
    scores: config.scores ?? zeroScores(),
    roundResult: config.roundResult ?? null,
    matchWinnerId: config.matchWinnerId ?? null,
    lastAction: config.lastAction ?? null,
  }
  return { session: createHostSession(publicState, privateStates), boneyard, rng: createRng(0) }
}

describe('createMexicanTrainSet', () => {
  it('produces all 91 unique double-12 tiles in deterministic order', () => {
    const set = createMexicanTrainSet()
    expect(set).toHaveLength(91)
    expect(new Set(set.map((t) => t.id)).size).toBe(91)
    expect(set.every((t) => t.a <= t.b && t.a >= 0 && t.b <= 12)).toBe(true)
    expect(set[0]).toEqual(tile(0, 0))
    expect(set[12]).toEqual(tile(0, 12))
    expect(set[13]).toEqual(tile(1, 1))
    expect(set[90]).toEqual(tile(12, 12))
    const seen = new Set(set.map((t) => t.id))
    for (let a = 0; a <= 12; a++) {
      for (let b = a; b <= 12; b++) {
        expect(seen.has(`${a}-${b}`)).toBe(true)
      }
    }
  })
})

describe('deal', () => {
  it('deals 13/13/13/13, leaves 38 in the boneyard, and never deals the engine double', () => {
    const mt = createMexicanTrainGame(PLAYERS, 42)
    const pub = mt.session.publicState
    expect(pub.engine).toBe(12)
    expect(pub.boneyardCount).toBe(38)
    for (const p of PLAYERS) {
      expect(pub.handCounts[p]).toBe(13)
      expect(mt.session.privateStates[p].hand.cards).toHaveLength(13)
    }
    expect(mt.boneyard.cards).toHaveLength(38)
    const dealt = new Set([
      ...mt.session.privateStates.p1.hand.cards,
      ...mt.session.privateStates.p2.hand.cards,
      ...mt.session.privateStates.p3.hand.cards,
      ...mt.session.privateStates.p4.hand.cards,
      ...mt.boneyard.cards,
    ].map((t) => t.id))
    expect(dealt.size).toBe(90)
    expect(dealt.has('12-12')).toBe(false)
    const all = new Set(createMexicanTrainSet().map((t) => t.id))
    for (const id of dealt) expect(all.has(id)).toBe(true)
  })

  it('is deterministic per seed and differs across seeds', () => {
    const mt = createMexicanTrainGame(PLAYERS, 42)
    const mt2 = createMexicanTrainGame(PLAYERS, 42)
    const mt3 = createMexicanTrainGame(PLAYERS, 43)
    const ids = (m: MTSession) => m.session.privateStates.p1.hand.cards.map((t) => t.id)
    expect(ids(mt2)).toEqual(ids(mt))
    expect(mt2.boneyard.cards.map((t) => t.id)).toEqual(mt.boneyard.cards.map((t) => t.id))
    expect(ids(mt3)).not.toEqual(ids(mt))
  })

  it('dealMTRound picks the engine from MT_ENGINE_SEQ for the round', () => {
    const r5 = dealMTRound(PLAYERS, 5, createRng(1))
    expect(r5.engine).toBe(7)
    expect(r5.boneyard.cards).toHaveLength(38)
    for (const p of PLAYERS) expect(r5.hands[p].cards).toHaveLength(13)
    const dealt5 = new Set([
      ...r5.hands.p1.cards, ...r5.hands.p2.cards, ...r5.hands.p3.cards, ...r5.hands.p4.cards,
      ...r5.boneyard.cards,
    ].map((t) => t.id))
    expect(dealt5.has('7-7')).toBe(false)

    const r12 = dealMTRound(PLAYERS, 12, createRng(1))
    expect(r12.engine).toBe(0)
    const dealt12 = new Set([
      ...r12.hands.p1.cards, ...r12.hands.p2.cards, ...r12.hands.p3.cards, ...r12.hands.p4.cards,
      ...r12.boneyard.cards,
    ].map((t) => t.id))
    expect(dealt12.has('0-0')).toBe(false)
  })
})

describe('laneEnd and legalLanes', () => {
  it('laneEnd exposes the engine value on an empty lane and the last outer otherwise', () => {
    const pub = buildGame({ trains: { p1: [placed(12, 5)], mex: [placed(12, 3)] } }).session.publicState
    expect(laneEnd(pub, 'p1')).toBe(5)
    expect(laneEnd(pub, 'mex')).toBe(3)
    expect(laneEnd(pub, 'p0')).toBe(12)
    expect(laneEnd(pub, 'p2')).toBe(12)
    expect(laneEnd(buildGame({ engine: 9 }).session.publicState, 'p3')).toBe(9)
  })

  it('own train and mex are always candidates; other seats only when open', () => {
    const pub = buildGame().session.publicState
    expect(legalLanes(tile(12, 5), 0, pub)).toEqual(['mex', 'p0'])
    expect(legalLanes(tile(5, 5), 0, pub)).toEqual([])
    const openPub = buildGame({ open: { p2: true } }).session.publicState
    expect(legalLanes(tile(12, 4), 0, openPub)).toEqual(['mex', 'p0', 'p2'])
    // seat 2's own lane is 'p2'; closed 'p0' stays out of the candidates
    expect(legalLanes(tile(12, 4), 2, openPub)).toEqual(['mex', 'p2'])
  })

  it('matches by either half against the lane end, not the engine', () => {
    const pub = buildGame({ trains: { mex: [placed(12, 5)], p0: [placed(12, 7)] } }).session.publicState
    expect(legalLanes(tile(5, 3), 0, pub)).toEqual(['mex'])
    expect(legalLanes(tile(7, 2), 0, pub)).toEqual(['p0'])
    expect(legalLanes(tile(12, 12), 0, pub)).toEqual([])
    expect(handHasLegalPlay(tiles([[5, 3]]), 0, pub)).toBe(true)
    expect(handHasLegalPlay(tiles([[12, 12]]), 0, pub)).toBe(false)
  })
})

describe('PLAY_TILE', () => {
  it('orients the placed tile with inner = lane end and outer = the other half', () => {
    const dm = buildGame({ hands: { p1: tiles([[12, 5], [4, 9], [3, 3], [4, 4]]), p2: [], p3: [], p4: [] } })
    let r = applyMTAction(dm, 'p1', { type: 'PLAY_TILE', tileId: '5-12', lane: 'mex' })
    expect(r.outcome.ok).toBe(true)
    expect(r.mt.session.publicState.trains.mex).toEqual([placed(12, 5)])

    const dm2 = buildGame({ engine: 9, hands: { p1: tiles([[4, 9], [3, 3], [4, 4], [1, 1]]), p2: [], p3: [], p4: [] } })
    r = applyMTAction(dm2, 'p1', { type: 'PLAY_TILE', tileId: '4-9', lane: 'mex' })
    expect(r.outcome.ok).toBe(true)
    expect(r.mt.session.publicState.trains.mex).toEqual([placed(9, 4)])
  })

  it('clears the open flag when playing on the own train and resets passStreak', () => {
    const dm = buildGame({
      open: { p0: true },
      passStreak: 2,
      hands: { p1: tiles([[12, 5], [3, 3], [4, 4], [1, 1]]), p2: [], p3: [], p4: [] },
    })
    const r = applyMTAction(dm, 'p1', { type: 'PLAY_TILE', tileId: '5-12', lane: 'p0' })
    expect(r.outcome.ok).toBe(true)
    const pub = r.mt.session.publicState
    expect(pub.open.p0).toBe(false)
    expect(pub.passStreak).toBe(0)
    expect(pub.trains.p0).toEqual([placed(12, 5)])
    expect(pub.lastAction).toEqual({ by: 'p1', kind: 'play', tile: { a: 5, b: 12 }, lane: 'p0', double: false, opened: null })
    expect(currentPlayer(pub.turn)).toBe('p2')
  })

  it('leaves open flags alone when playing on mex or an open opponent train', () => {
    const dm = buildGame({
      open: { p2: true },
      hands: { p1: tiles([[12, 4], [3, 3], [4, 4], [1, 1]]), p2: [], p3: [], p4: [] },
    })
    let r = applyMTAction(dm, 'p1', { type: 'PLAY_TILE', tileId: '4-12', lane: 'mex' })
    expect(r.outcome.ok).toBe(true)
    expect(r.mt.session.publicState.open.p2).toBe(true)

    const dm2 = buildGame({
      open: { p2: true },
      hands: { p1: tiles([[12, 4], [3, 3], [4, 4], [1, 1]]), p2: [], p3: [], p4: [] },
    })
    r = applyMTAction(dm2, 'p1', { type: 'PLAY_TILE', tileId: '4-12', lane: 'p2' })
    expect(r.outcome.ok).toBe(true)
    const pub = r.mt.session.publicState
    expect(pub.open.p2).toBe(true)
    expect(pub.trains.p2).toEqual([placed(12, 4)])
    expect(pub.lastAction).toEqual({ by: 'p1', kind: 'play', tile: { a: 4, b: 12 }, lane: 'p2', double: false, opened: null })
  })

  it('rejects a tile not in hand', () => {
    const dm = buildGame({ hands: { p1: tiles([[12, 5], [3, 3], [4, 4], [1, 1]]), p2: [], p3: [], p4: [] } })
    const r = applyMTAction(dm, 'p1', { type: 'PLAY_TILE', tileId: '6-6', lane: 'mex' })
    expect(r.outcome.ok).toBe(false)
  })

  it('rejects a non-legal lane', () => {
    const dm = buildGame({ hands: { p1: tiles([[12, 5], [3, 3], [4, 4], [1, 1]]), p2: [], p3: [], p4: [] } })
    let r = applyMTAction(dm, 'p1', { type: 'PLAY_TILE', tileId: '5-12', lane: 'p2' })   // p2 not open
    expect(r.outcome.ok).toBe(false)
    r = applyMTAction(dm, 'p1', { type: 'PLAY_TILE', tileId: '3-3', lane: 'mex' })      // matches nothing
    expect(r.outcome.ok).toBe(false)
  })

  it('rejects an out-of-turn play', () => {
    const dm = buildGame({
      currentIndex: 1,
      hands: { p1: tiles([[12, 5], [3, 3], [4, 4], [1, 1]]), p2: [], p3: [], p4: [] },
    })
    const r = applyMTAction(dm, 'p1', { type: 'PLAY_TILE', tileId: '5-12', lane: 'mex' })
    expect(r.outcome.ok).toBe(false)
  })
})

describe('DRAW_TILE', () => {
  it('is rejected when a legal play exists', () => {
    const dm = buildGame({
      hands: { p1: tiles([[12, 5], [3, 3], [4, 4], [1, 1]]), p2: [], p3: [], p4: [] },
      boneyard: tiles([[0, 0], [2, 2]]),
    })
    expect(applyMTAction(dm, 'p1', { type: 'DRAW_TILE' }).outcome.ok).toBe(false)
  })

  it('is rejected when the boneyard is empty', () => {
    const dm = buildGame({ boneyard: [] })
    expect(applyMTAction(dm, 'p1', { type: 'DRAW_TILE' }).outcome.ok).toBe(false)
  })

  it('a playable draw keeps the turn with the player, who must now play it', () => {
    const dm = buildGame({
      hands: { p1: tiles([[1, 1], [2, 2], [3, 3], [4, 4]]), p2: [], p3: [], p4: [] },
      boneyard: tiles([[12, 4]]),
    })
    const before = dm.session.publicState.turn
    let r = applyMTAction(dm, 'p1', { type: 'DRAW_TILE' })
    expect(r.outcome.ok).toBe(true)
    let pub = r.mt.session.publicState
    expect(pub.handCounts.p1).toBe(5)
    expect(pub.boneyardCount).toBe(0)
    expect(pub.turn).toEqual(before)
    expect(pub.lastAction).toEqual({ by: 'p1', kind: 'draw', tile: null, lane: null, double: false, opened: null })

    r = applyMTAction(r.mt, 'p1', { type: 'DRAW_TILE' })
    expect(r.outcome.ok).toBe(false)
    r = applyMTAction(r.mt, 'p1', { type: 'PLAY_TILE', tileId: '4-12', lane: 'mex' })
    expect(r.outcome.ok).toBe(true)
    pub = r.mt.session.publicState
    expect(pub.trains.mex).toEqual([placed(12, 4)])
    expect(currentPlayer(pub.turn)).toBe('p2')
  })

  it('a dead draw opens the own train and advances', () => {
    const dm = buildGame({
      hands: { p1: tiles([[1, 1], [2, 2], [3, 3], [4, 4]]), p2: [], p3: [], p4: [] },
      boneyard: tiles([[5, 5]]),
    })
    const r = applyMTAction(dm, 'p1', { type: 'DRAW_TILE' })
    expect(r.outcome.ok).toBe(true)
    const pub = r.mt.session.publicState
    expect(pub.open.p0).toBe(true)
    expect(pub.handCounts.p1).toBe(5)
    expect(pub.boneyardCount).toBe(0)
    expect(currentPlayer(pub.turn)).toBe('p2')
    expect(pub.lastAction).toEqual({ by: 'p1', kind: 'draw', tile: null, lane: null, double: false, opened: 'p0' })
  })
})

describe('PASS', () => {
  it('is rejected when a legal play exists', () => {
    const dm = buildGame({
      hands: { p1: tiles([[12, 5], [3, 3], [4, 4], [1, 1]]), p2: [], p3: [], p4: [] },
      boneyard: [],
    })
    expect(applyMTAction(dm, 'p1', { type: 'PASS' }).outcome.ok).toBe(false)
  })

  it('is rejected when the boneyard is not empty', () => {
    const dm = buildGame({ boneyard: tiles([[5, 5]]) })
    expect(applyMTAction(dm, 'p1', { type: 'PASS' }).outcome.ok).toBe(false)
  })

  it('opens the own train and advances the turn', () => {
    const dm = buildGame({ boneyard: [] })
    const r = applyMTAction(dm, 'p1', { type: 'PASS' })
    expect(r.outcome.ok).toBe(true)
    const pub = r.mt.session.publicState
    expect(pub.open.p0).toBe(true)
    expect(pub.passStreak).toBe(1)
    expect(currentPlayer(pub.turn)).toBe('p2')
    expect(pub.lastAction).toEqual({ by: 'p1', kind: 'pass-open', tile: null, lane: null, double: false, opened: 'p0' })
  })
})

describe('blocked round', () => {
  it('four consecutive passes end the round blocked with the right pip accumulation', () => {
    const dm = buildGame({
      hands: {
        p1: tiles([[1, 1], [2, 2]]),        // 6 pips
        p2: tiles([[3, 3], [4, 4]]),        // 14 pips
        p3: tiles([[0, 1], [1, 1]]),        // 3 pips
        p4: tiles([[2, 3], [2, 2]]),        // 9 pips
      },
      boneyard: [],
    })
    let r = applyMTAction(dm, 'p1', { type: 'PASS' })
    expect(r.outcome.ok).toBe(true)
    expect(r.mt.session.publicState.passStreak).toBe(1)
    r = applyMTAction(r.mt, 'p2', { type: 'PASS' })
    expect(r.outcome.ok).toBe(true)
    expect(r.mt.session.publicState.passStreak).toBe(2)
    r = applyMTAction(r.mt, 'p3', { type: 'PASS' })
    expect(r.outcome.ok).toBe(true)
    expect(r.mt.session.publicState.passStreak).toBe(3)
    r = applyMTAction(r.mt, 'p4', { type: 'PASS' })
    expect(r.outcome.ok).toBe(true)
    const pub = r.mt.session.publicState
    expect(pub.stage).toBe('roundEnd')
    expect(pub.roundResult).toEqual({
      kind: 'blocked',
      outPlayerId: null,
      pips: { p1: 6, p2: 14, p3: 3, p4: 9 },
    })
    expect(pub.scores).toEqual({ p1: 6, p2: 14, p3: 3, p4: 9 })
    expect(pub.matchWinnerId).toBeNull()
  })
})

describe('doubles', () => {
  it('a double grants an extra play: turn unchanged, doublePending true', () => {
    const dm = buildGame({
      hands: { p1: tiles([[12, 12], [12, 5], [3, 3], [1, 1]]), p2: [], p3: [], p4: [] },
      boneyard: [],
    })
    let r = applyMTAction(dm, 'p1', { type: 'PLAY_TILE', tileId: '12-12', lane: 'mex' })
    expect(r.outcome.ok).toBe(true)
    let pub = r.mt.session.publicState
    expect(pub.doublePending).toBe(true)
    expect(pub.trains.mex).toEqual([placed(12, 12, true)])
    expect(currentPlayer(pub.turn)).toBe('p1')
    expect(pub.lastAction).toEqual({ by: 'p1', kind: 'play', tile: { a: 12, b: 12 }, lane: 'mex', double: true, opened: null })

    r = applyMTAction(r.mt, 'p1', { type: 'PLAY_TILE', tileId: '5-12', lane: 'mex' })
    expect(r.outcome.ok).toBe(true)
    pub = r.mt.session.publicState
    expect(pub.doublePending).toBe(false)
    expect(currentPlayer(pub.turn)).toBe('p2')
  })

  it('a double as the last tile ends the round out — even the double does not grant a play', () => {
    const dm = buildGame({
      hands: {
        p1: tiles([[12, 12]]),
        p2: tiles([[1, 1], [2, 2]]),        // 6 pips
        p3: tiles([[3, 3]]),                // 6 pips
        p4: tiles([[0, 1], [1, 1]]),        // 3 pips
      },
      boneyard: [],
    })
    const r = applyMTAction(dm, 'p1', { type: 'PLAY_TILE', tileId: '12-12', lane: 'mex' })
    expect(r.outcome.ok).toBe(true)
    const pub = r.mt.session.publicState
    expect(pub.stage).toBe('roundEnd')
    expect(pub.roundResult).toEqual({
      kind: 'out',
      outPlayerId: 'p1',
      pips: { p1: 0, p2: 6, p3: 6, p4: 3 },
    })
    expect(pub.scores).toEqual({ p1: 0, p2: 6, p3: 6, p4: 3 })
  })

  it('going out adds 0 for the out player and pips for the rest, on top of prior scores', () => {
    const dm = buildGame({
      scores: { p1: 10, p2: 4, p3: 7, p4: 9 },
      hands: {
        p1: tiles([[12, 5]]),
        p2: tiles([[1, 1], [2, 2]]),        // 6 pips
        p3: tiles([[3, 3]]),                // 6 pips
        p4: tiles([[0, 1], [1, 1]]),        // 3 pips
      },
      boneyard: [],
    })
    const r = applyMTAction(dm, 'p1', { type: 'PLAY_TILE', tileId: '5-12', lane: 'mex' })
    expect(r.outcome.ok).toBe(true)
    const pub = r.mt.session.publicState
    expect(pub.scores).toEqual({ p1: 10, p2: 10, p3: 13, p4: 12 })
    expect(pub.roundResult?.pips).toEqual({ p1: 0, p2: 6, p3: 6, p4: 3 })
    expect(pub.matchWinnerId).toBeNull()   // round 0, match continues
  })

  it('a stuck-after-double resolves via a dead draw: opens the train and advances', () => {
    const dm = buildGame({
      hands: { p1: tiles([[12, 12], [1, 1], [3, 3], [4, 4]]), p2: [], p3: [], p4: [] },
      boneyard: tiles([[5, 5]]),
    })
    let r = applyMTAction(dm, 'p1', { type: 'PLAY_TILE', tileId: '12-12', lane: 'mex' })
    expect(r.outcome.ok).toBe(true)
    expect(r.mt.session.publicState.doublePending).toBe(true)

    r = applyMTAction(r.mt, 'p1', { type: 'DRAW_TILE' })
    expect(r.outcome.ok).toBe(true)
    const pub = r.mt.session.publicState
    expect(pub.open.p0).toBe(true)
    expect(pub.doublePending).toBe(false)
    expect(currentPlayer(pub.turn)).toBe('p2')
  })

  it('a stuck-after-double resolves via a playable draw: draw, then play the drawn tile', () => {
    const dm = buildGame({
      hands: { p1: tiles([[12, 12], [1, 1], [3, 3], [4, 4]]), p2: [], p3: [], p4: [] },
      boneyard: tiles([[12, 7]]),
    })
    let r = applyMTAction(dm, 'p1', { type: 'PLAY_TILE', tileId: '12-12', lane: 'mex' })
    expect(r.outcome.ok).toBe(true)
    r = applyMTAction(r.mt, 'p1', { type: 'DRAW_TILE' })
    expect(r.outcome.ok).toBe(true)
    expect(currentPlayer(r.mt.session.publicState.turn)).toBe('p1')
    expect(r.mt.session.publicState.doublePending).toBe(true)

    r = applyMTAction(r.mt, 'p1', { type: 'PLAY_TILE', tileId: '7-12', lane: 'mex' })
    expect(r.outcome.ok).toBe(true)
    const pub = r.mt.session.publicState
    expect(pub.doublePending).toBe(false)
    expect(pub.handCounts.p1).toBe(3)
    expect(currentPlayer(pub.turn)).toBe('p2')
  })

  it('a stuck-after-double resolves via pass when the boneyard is empty', () => {
    const dm = buildGame({
      hands: { p1: tiles([[12, 12], [1, 1], [3, 3], [4, 4]]), p2: [], p3: [], p4: [] },
      boneyard: [],
    })
    let r = applyMTAction(dm, 'p1', { type: 'PLAY_TILE', tileId: '12-12', lane: 'mex' })
    expect(r.outcome.ok).toBe(true)
    expect(r.mt.session.publicState.doublePending).toBe(true)

    r = applyMTAction(r.mt, 'p1', { type: 'PASS' })
    expect(r.outcome.ok).toBe(true)
    const pub = r.mt.session.publicState
    expect(pub.open.p0).toBe(true)
    expect(pub.doublePending).toBe(false)
    expect(pub.passStreak).toBe(1)
    expect(currentPlayer(pub.turn)).toBe('p2')
  })
})

describe('START_NEXT_ROUND', () => {
  it('is rejected during play, after the match is over, and for non-players', () => {
    expect(applyMTAction(buildGame(), 'p1', { type: 'START_NEXT_ROUND' }).outcome.ok).toBe(false)
    const over = buildGame({ stage: 'over', matchWinnerId: 'p1' })
    expect(applyMTAction(over, 'p1', { type: 'START_NEXT_ROUND' }).outcome.ok).toBe(false)
    const roundEnd = buildGame({ stage: 'roundEnd' })
    expect(applyMTAction(roundEnd, 'ghost', { type: 'START_NEXT_ROUND' }).outcome.ok).toBe(false)
  })

  it('round 0→1 redeals with engine 11, resets the board, and rotates the starter to seat 1', () => {
    const dm = buildGame({
      stage: 'roundEnd',
      round: 0,
      scores: { p1: 3, p2: 1, p3: 5, p4: 2 },
      roundResult: { kind: 'out', outPlayerId: 'p1', pips: { p1: 0, p2: 1, p3: 5, p4: 2 } },
      lastAction: { by: 'p1', kind: 'play', tile: { a: 5, b: 12 }, lane: 'mex', double: false, opened: null },
    })
    const r = applyMTAction(dm, 'p2', { type: 'START_NEXT_ROUND' })
    expect(r.outcome.ok).toBe(true)
    const pub = r.mt.session.publicState
    expect(pub.stage).toBe('play')
    expect(pub.round).toBe(1)
    expect(pub.engine).toBe(11)
    expect(pub.turn.playerOrder).toEqual(PLAYERS)
    expect(currentPlayer(pub.turn)).toBe('p2')
    expect(pub.trains).toEqual(emptyTrains())
    expect(pub.open).toEqual(emptyOpen())
    expect(pub.doublePending).toBe(false)
    expect(pub.passStreak).toBe(0)
    expect(pub.roundResult).toBeNull()
    expect(pub.lastAction).toBeNull()
    expect(pub.boneyardCount).toBe(38)
    expect(pub.handCounts).toEqual({ p1: 13, p2: 13, p3: 13, p4: 13 })
    expect(pub.scores).toEqual({ p1: 3, p2: 1, p3: 5, p4: 2 })
    for (const p of PLAYERS) expect(cardCount(r.mt.session.privateStates[p].hand)).toBe(13)
    expect(r.mt.boneyard.cards).toHaveLength(38)
    const dealt = new Set([
      ...r.mt.session.privateStates.p1.hand.cards,
      ...r.mt.session.privateStates.p2.hand.cards,
      ...r.mt.session.privateStates.p3.hand.cards,
      ...r.mt.session.privateStates.p4.hand.cards,
      ...r.mt.boneyard.cards,
    ].map((t) => t.id))
    expect(dealt.size).toBe(90)
    expect(dealt.has('11-11')).toBe(false)
  })

  it('rounds 1, 2, 3 start at seats 1, 2, 3 and engines follow MT_ENGINE_SEQ', () => {
    for (const r of [0, 1, 2]) {
      const dm = buildGame({ stage: 'roundEnd', round: r })
      const res = applyMTAction(dm, 'p3', { type: 'START_NEXT_ROUND' })
      expect(res.outcome.ok).toBe(true)
      const pub = res.mt.session.publicState
      expect(pub.engine).toBe(MT_ENGINE_SEQ[r + 1])
      expect(currentPlayer(pub.turn)).toBe(PLAYERS[(r + 1) % 4])
    }
    const dm = buildGame({ stage: 'roundEnd', round: 3 })
    const res = applyMTAction(dm, 'p1', { type: 'START_NEXT_ROUND' })
    expect(res.outcome.ok).toBe(true)
    expect(currentPlayer(res.mt.session.publicState.turn)).toBe('p1')
    expect(res.mt.session.publicState.engine).toBe(8)
  })
})

describe('match over', () => {
  it('after round 12 the lowest total wins', () => {
    const dm = buildGame({
      round: 12,
      engine: 0,
      scores: { p1: 5, p2: 7, p3: 11, p4: 13 },
      hands: { p1: tiles([[0, 3]]), p2: [], p3: [], p4: [] },
      boneyard: [],
    })
    const r = applyMTAction(dm, 'p1', { type: 'PLAY_TILE', tileId: '0-3', lane: 'mex' })
    expect(r.outcome.ok).toBe(true)
    const pub = r.mt.session.publicState
    expect(pub.stage).toBe('over')
    expect(pub.matchWinnerId).toBe('p1')
    expect(pub.roundResult).toEqual({ kind: 'out', outPlayerId: 'p1', pips: { p1: 0, p2: 0, p3: 0, p4: 0 } })
    expect(pub.scores).toEqual({ p1: 5, p2: 7, p3: 11, p4: 13 })
  })

  it('a lowest-total tie goes to the tied player earliest in seatOrder', () => {
    const dm = buildGame({
      round: 12,
      engine: 0,
      scores: { p1: 8, p2: 5, p3: 5, p4: 13 },
      hands: { p1: tiles([[0, 3]]), p2: [], p3: [], p4: [] },
      boneyard: [],
    })
    const r = applyMTAction(dm, 'p1', { type: 'PLAY_TILE', tileId: '0-3', lane: 'mex' })
    expect(r.outcome.ok).toBe(true)
    const pub = r.mt.session.publicState
    expect(pub.stage).toBe('over')
    expect(pub.matchWinnerId).toBe('p2')   // p2 and p3 both at 5; p2 is earlier in seatOrder
  })
})

describe('no leak and wire safety', () => {
  it('a snapshot exposes only its own hand; no other hands or boneyard ids in public state', () => {
    const dm = buildGame({
      hands: {
        p1: tiles([[12, 5], [1, 1], [3, 3], [4, 4]]),
        p2: tiles([[12, 6], [2, 2]]),
        p3: tiles([[11, 1], [3, 4]]),
        p4: tiles([[10, 1], [4, 5]]),
      },
      boneyard: tiles([[9, 9], [8, 8], [7, 7]]),
    })
    const r = applyMTAction(dm, 'p1', { type: 'PLAY_TILE', tileId: '5-12', lane: 'mex' })
    expect(r.outcome.ok).toBe(true)

    const snap = deriveSnapshot(r.mt.session, 'p1')
    expect(snap.privateState).toEqual(r.mt.session.privateStates.p1)
    expect(snap.privateState?.hand.cards.map((t) => t.id)).toEqual(['1-1', '3-3', '4-4'])

    const otherIds = new Set([
      ...r.mt.session.privateStates.p2.hand.cards,
      ...r.mt.session.privateStates.p3.hand.cards,
      ...r.mt.session.privateStates.p4.hand.cards,
      ...r.mt.boneyard.cards,
    ].map((t) => t.id))
    const json = JSON.stringify(snap.publicState)
    for (const id of otherIds) expect(json).not.toContain(id)
    expect(isJsonSerializable(snap)).toBe(true)
  })

  it('public and private state survive assertWireSafe and a lossless JSON round-trip', () => {
    const dm = buildGame({
      hands: {
        p1: tiles([[12, 5], [1, 1], [3, 3], [4, 4]]),
        p2: tiles([[5, 6], [2, 2]]),
        p3: tiles([[11, 1], [3, 4]]),
        p4: tiles([[10, 1], [4, 5]]),
      },
      boneyard: tiles([[9, 9], [8, 8], [7, 7]]),
    })
    let r = applyMTAction(dm, 'p1', { type: 'PLAY_TILE', tileId: '5-12', lane: 'mex' })
    expect(r.outcome.ok).toBe(true)
    r = applyMTAction(r.mt, 'p2', { type: 'PLAY_TILE', tileId: '5-6', lane: 'mex' })
    expect(r.outcome.ok).toBe(true)

    const pub = r.mt.session.publicState
    const priv = r.mt.session.privateStates.p1
    const snap = deriveSnapshot(r.mt.session, 'p1')
    expect(() => assertWireSafe(pub, 'test')).not.toThrow()
    expect(() => assertWireSafe(priv, 'test')).not.toThrow()
    expect(() => assertWireSafe(snap, 'test')).not.toThrow()
    expect(JSON.parse(JSON.stringify(pub))).toEqual(pub)
    expect(JSON.parse(JSON.stringify(priv))).toEqual(priv)
    expect(JSON.parse(JSON.stringify(snap))).toEqual(snap)
  })
})

describe('bot', () => {
  it('ranks own train > mex > open opponent at equal pips', () => {
    const pub = buildGame({
      trains: { p0: [placed(12, 5)], mex: [placed(12, 5)], p3: [placed(12, 5)] },
      open: { p3: true },
    }).session.publicState
    const priv: MTPrivateState = { hand: addCards(createHand<MTTile>('p1'), tiles([[5, 6]])) }
    expect(mexicanTrainBotStrategy(pub, priv, 'p1')).toEqual({ type: 'PLAY_TILE', tileId: '5-6', lane: 'p0' })
  })

  it('prefers mex over an open opponent when the own train does not match', () => {
    const pub = buildGame({
      trains: { p0: [placed(12, 7)], mex: [placed(12, 5)], p2: [placed(12, 5)] },
      open: { p2: true },
    }).session.publicState
    const priv: MTPrivateState = { hand: addCards(createHand<MTTile>('p1'), tiles([[5, 6]])) }
    expect(mexicanTrainBotStrategy(pub, priv, 'p1')).toEqual({ type: 'PLAY_TILE', tileId: '5-6', lane: 'mex' })
  })

  it('plays doubles preferentially within a lane tier', () => {
    const pub = buildGame().session.publicState
    const priv: MTPrivateState = { hand: addCards(createHand<MTTile>('p1'), tiles([[12, 4], [12, 12]])) }
    expect(mexicanTrainBotStrategy(pub, priv, 'p1')).toEqual({ type: 'PLAY_TILE', tileId: '12-12', lane: 'p0' })
  })

  it('draws when stuck and passes when stuck with an empty boneyard', () => {
    const pub = buildGame().session.publicState
    const priv: MTPrivateState = { hand: addCards(createHand<MTTile>('p1'), tiles([[1, 1], [2, 2], [3, 3]])) }
    expect(mexicanTrainBotStrategy({ ...pub, boneyardCount: 3 }, priv, 'p1')).toEqual({ type: 'DRAW_TILE' })
    expect(mexicanTrainBotStrategy({ ...pub, boneyardCount: 0 }, priv, 'p1')).toEqual({ type: 'PASS' })
  })

  it('a full bot match runs all 13 rounds to completion with every action accepted', () => {
    let mt = createMexicanTrainGame(PLAYERS, 7)
    let actions = 0
    while (mt.session.publicState.matchWinnerId === null && actions < 5000) {
      const pub = mt.session.publicState
      if (pub.stage === 'roundEnd') {
        const r = applyMTAction(mt, 'p1', { type: 'START_NEXT_ROUND' })
        expect(r.outcome.ok).toBe(true)
        mt = r.mt
        actions++
        continue
      }
      const player = currentPlayer(pub.turn)
      const r = runMTBotTurn(mt, player, mexicanTrainBotStrategy)
      expect(r.outcome.ok).toBe(true)
      mt = r.mt
      actions++
    }
    expect(mt.session.publicState.stage).toBe('over')
    expect(mt.session.publicState.matchWinnerId).not.toBeNull()
    expect(actions).toBeLessThan(5000)
  })
})
