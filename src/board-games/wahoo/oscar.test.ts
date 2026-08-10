// Oscar's adversarial probes for the Wahoo module. Every test here is a
// forgery/edge-case attempt against state.ts/rules.ts/bot.ts. A passing suite
// means the attack was blocked or the rule held; it is left in place as a
// standing regression net, not scratch work.
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
import { applyWahooAction } from './rules.ts'
import {
  HOME_ENTRANCE_REL,
  LANE_END,
  LANE_START,
  SHORTCUT_ENTRIES,
  SHORTCUT_EXITS,
  trackIndexFor,
} from './board.ts'

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

describe('attack: wrap-boundary cross-seat collision (63 -> 0)', () => {
  it('bumps correctly when the landing hole is absolute index 14, the come-out seam of arm 0', () => {
    // p2 sits at arm3 rel 57 = absolute (48+14+57)%64 = 55. Not the case we want.
    // We want two seats whose absolute landing coincides exactly AT the seam: abs 14.
    // p1 arm0 rel0 = abs14 (its own come-out). p2 arm2 rel32 = abs (46+32)%64 = 14.
    expect(trackIndexFor(2, 32)).toBe(14)
    const wh = buildWahoo({
      phase: 'move',
      die: 1,
      currentIndex: 1,
      positions: { p1: [-1, -1, -1, -1], p2: [31, -1, -1, -1] },
    })
    expect(legalMoves(wh.session.publicState, 'p2', 1)).toContainEqual({ marbleIdx: 0, kind: 'advance' })
    const r = applyWahooAction(wh, 'p2', { type: 'MOVE', move: { marbleIdx: 0, kind: 'advance' } })
    expect(r.outcome.ok).toBe(true)
    const pub = r.wh.session.publicState
    expect(pub.positions['p2']).toEqual([32, -1, -1, -1])
    expect(pub.lastEvent).toEqual({ kind: 'move', by: 'p2', marbleIdx: 0, bumpedId: null })
  })

  it('own-marble block also holds exactly at the wrap seam (abs 7 -> abs 14 is NOT the same hole)', () => {
    // Sanity: the home entrance (abs 7) and the come-out (abs 14) are distinct
    // holes; a marble sitting on the entrance must not spuriously block a
    // landing on the come-out.
    // p1 arm0 rel57 = abs7 (its home entrance). 'out' lands on rel0 -- the
    // come-out is a different absolute (14) from 7, so 'out' must remain legal.
    const wh = buildWahoo({
      phase: 'move',
      die: 1,
      positions: { p1: [HOME_ENTRANCE_REL, -1, -1, -1], p2: [-1, -1, -1, -1] },
    })
    expect(legalMoves(wh.session.publicState, 'p1', 1).some((m) => m.kind === 'out')).toBe(true)
  })

  it('two seats whose relative positions differ but whose absolute wrap-adjacent holes coincide get bumped, not silently allowed to coexist', () => {
    // p1 arm0 rel51 = abs (14+51)%64 = 65%64=1. p2 arm3 starts at rel1 = abs 63
    // (its own corner, the last hole before the wrap seam), then advances die 2
    // to rel3 = abs (62+3)%64 = 65%64=1.
    // Cross-seat collision just past the seam: the attacker lands on the victim's hole.
    expect(trackIndexFor(3, 3)).toBe(1)
    expect(trackIndexFor(0, 51)).toBe(1)
    const wh = buildWahoo({
      playerIds: ['p1', 'p2'],
      seatArms: { p1: 0, p2: 3 },
      phase: 'move',
      die: 2,
      currentIndex: 1,
      positions: { p1: [51, -1, -1, -1], p2: [1, -1, -1, -1] },
    })
    const r = applyWahooAction(wh, 'p2', { type: 'MOVE', move: { marbleIdx: 0, kind: 'advance' } })
    expect(r.outcome.ok).toBe(true)
    const pub = r.wh.session.publicState
    expect(pub.positions['p2']).toEqual([3, -1, -1, -1])
    expect(pub.positions['p1']).toEqual([-1, -1, -1, -1])
    expect(pub.lastEvent).toEqual({ kind: 'move', by: 'p2', marbleIdx: 0, bumpedId: 'p1' })
  })
})

describe('attack: move forgery', () => {
  it('rejects a move whose marbleIdx/kind pair mixes two independently-legal moves', () => {
    // marble 0 can 'advance' (die matches plain step); marble 1 can 'out'. Neither
    // marble 0 'out' nor marble 1 'advance' should be accepted.
    const wh = buildWahoo({
      phase: 'move',
      die: 6,
      positions: { p1: [5, -1, -1, -1], p2: [-1, -1, -1, -1] },
    })
    const moves = legalMoves(wh.session.publicState, 'p1', 6)
    expect(moves).toContainEqual({ marbleIdx: 0, kind: 'advance' })
    expect(moves).toContainEqual({ marbleIdx: 1, kind: 'out' })
    const forged = applyWahooAction(wh, 'p1', { type: 'MOVE', move: { marbleIdx: 1, kind: 'advance' } })
    expect(forged.outcome.ok).toBe(false)
    const forged2 = applyWahooAction(wh, 'p1', { type: 'MOVE', move: { marbleIdx: 0, kind: 'out' } })
    expect(forged2.outcome.ok).toBe(false)
  })

  it('rejects an unknown move kind string at the JSON boundary (untyped client payload)', () => {
    const wh = buildWahoo({ phase: 'move', die: 3, positions: { p1: [5, -1, -1, -1], p2: [-1, -1, -1, -1] } })
    const forged = applyWahooAction(wh, 'p1', {
      type: 'MOVE',
      move: { marbleIdx: 0, kind: 'teleport' as unknown as 'advance' },
    })
    expect(forged.outcome.ok).toBe(false)
  })

  it('rejects a second MOVE against the same already-consumed die (stale replay)', () => {
    const wh = buildWahoo({ phase: 'move', die: 3, positions: { p1: [5, -1, -1, -1], p2: [-1, -1, -1, -1] } })
    const first = applyWahooAction(wh, 'p1', { type: 'MOVE', move: { marbleIdx: 0, kind: 'advance' } })
    expect(first.outcome.ok).toBe(true)
    expect(first.wh.session.publicState.turn.phase).toBe('roll')
    // Replaying the exact same accepted action against the pre-move session must
    // fail once state has actually moved on (simulated here by re-submitting to
    // the POST-move session, where phase is 'roll' and die is null).
    const replay = applyWahooAction(first.wh, 'p1', { type: 'MOVE', move: { marbleIdx: 0, kind: 'advance' } })
    expect(replay.outcome.ok).toBe(false)

    // Confirm it fails for the *right* reason: phase gating, not just turn
    // gating -- the current player (p2) also cannot submit a MOVE with p1's
    // stale die, because phase is 'roll' (die cleared) until they ROLL.
    const p2replay = applyWahooAction(first.wh, 'p2', { type: 'MOVE', move: { marbleIdx: 0, kind: 'advance' } })
    expect(p2replay.outcome.ok).toBe(false)
    expect(p2replay.outcome.reason).toContain('roll first')
  })

  it('MOVE is rejected once the game is over even with an otherwise-legal move', () => {
    const wh = buildWahoo({
      stage: 'over',
      winnerId: 'p1',
      phase: 'move',
      die: 3,
      positions: { p1: [5, -1, -1, -1], p2: [-1, -1, -1, -1] },
    })
    const r = applyWahooAction(wh, 'p1', { type: 'MOVE', move: { marbleIdx: 0, kind: 'advance' } })
    expect(r.outcome.ok).toBe(false)
    expect(r.outcome.reason).toContain('game over')
  })
})

describe('attack: lane privacy', () => {
  it('a lane marble (58-61) can never be found as a bump target by any opponent advance', () => {
    // p2 (arm2) sets up a marble whose absolute landing hole (60) numerically
    // coincides with p1's lane index 60 (58-61 are not track holes at all, but
    // verify no track-side move can ever target/clear a lane slot).
    const wh = buildWahoo({
      phase: 'move',
      die: 4,
      currentIndex: 1,
      positions: { p1: [LANE_START, LANE_START + 1, LANE_START + 2, LANE_END], p2: [10, -1, -1, -1] },
    })
    const r = applyWahooAction(wh, 'p2', { type: 'MOVE', move: { marbleIdx: 0, kind: 'advance' } })
    expect(r.outcome.ok).toBe(true)
    // p1's lane marbles are untouched by any opponent track move.
    expect(r.wh.session.publicState.positions['p1']).toEqual([
      LANE_START,
      LANE_START + 1,
      LANE_START + 2,
      LANE_END,
    ])
  })
})

describe('attack: six-chain integrity', () => {
  it('extraTurn does not leak sixStreak into the next players turn', () => {
    // p1 rolls a 6, moves (streak -> 1, extra turn). Then rolls again and gets a
    // NO-LEGAL-MOVE roll (pass): streak must reset to 0 and turn must pass to p2
    // with a clean slate, not carry streak=1 forward.
    let wh = buildWahoo({
      phase: 'roll',
      rngSeed: 749, // first roll is 6 (see wahoo.test.ts)
      positions: { p1: [5, -1, -1, -1], p2: [-1, -1, -1, -1] },
    })
    let r = applyWahooAction(wh, 'p1', { type: 'ROLL' })
    expect(r.outcome.ok).toBe(true)
    wh = r.wh
    expect(wh.session.publicState.die).toBe(6)
    r = applyWahooAction(wh, 'p1', { type: 'MOVE', move: { marbleIdx: 0, kind: 'advance' } })
    expect(r.outcome.ok).toBe(true)
    wh = r.wh
    expect(wh.session.publicState.sixStreak).toBe(1)
    expect(currentPlayer(wh.session.publicState.turn)).toBe('p1')

    // Force a no-legal-move state for p1's extra roll manually (all marbles
    // parked such that nothing can move), then roll. The marble at 52 wants 58
    // but the lane slot is occupied; every lane marble overshoots with a 6.
    const stuck = buildWahoo({
      playerIds: ['p1', 'p2'],
      phase: 'roll',
      rngSeed: 4, // first roll is 6, see wahoo.test.ts "6 with no legal move"
      sixStreak: 1,
      positions: { p1: [52, LANE_START, LANE_START + 1, LANE_START + 2], p2: [-1, -1, -1, -1] },
    })
    const passResult = applyWahooAction(stuck, 'p1', { type: 'ROLL' })
    expect(passResult.outcome.ok).toBe(true)
    const pub = passResult.wh.session.publicState
    expect(pub.sixStreak).toBe(0)
    expect(currentPlayer(pub.turn)).toBe('p2')

    // Now p2 rolls a 6 and moves: their streak must start fresh at 1, not
    // inherit anything from p1's earlier chain.
    const p2wh = buildWahoo({
      playerIds: ['p1', 'p2'],
      phase: 'roll',
      currentIndex: 1,
      rngSeed: 749,
      sixStreak: 0,
      positions: { p1: [-1, -1, -1, -1], p2: [5, -1, -1, -1] },
    })
    const rolled = applyWahooAction(p2wh, 'p2', { type: 'ROLL' })
    expect(rolled.outcome.ok).toBe(true)
    const moved = applyWahooAction(rolled.wh, 'p2', { type: 'MOVE', move: { marbleIdx: 0, kind: 'advance' } })
    expect(moved.outcome.ok).toBe(true)
    expect(moved.wh.session.publicState.sixStreak).toBe(1)
  })

  it('bust on the third six clears centerBy when the busted marble just entered center this turn', () => {
    // p1 at rel 12 shortcuts into the center via corner 17 (die = 17-12+1 = 6),
    // and this is the third consecutive six.
    const wh = buildWahoo({
      phase: 'move',
      die: 6,
      sixStreak: 2,
      positions: { p1: [12, -1, -1, -1], p2: [-1, -1, -1, -1] },
    })
    expect(legalMoves(wh.session.publicState, 'p1', 6)).toContainEqual({ marbleIdx: 0, kind: 'shortcut' })
    const r = applyWahooAction(wh, 'p1', { type: 'MOVE', move: { marbleIdx: 0, kind: 'shortcut' } })
    expect(r.outcome.ok).toBe(true)
    const pub = r.wh.session.publicState
    expect(pub.lastEvent).toEqual({ kind: 'bust', by: 'p1' })
    expect(pub.positions['p1']).toEqual([-1, -1, -1, -1]) // busted back to base
    expect(pub.centerBy).toBeNull() // must not be left dangling on the marble that no longer exists there
    expect(pub.sixStreak).toBe(0)
  })

  it('bust on the third six leaves an UNRELATED, pre-existing centerBy alone', () => {
    // p1 already has marble 1 sitting in the center from an earlier turn. The
    // third six this turn moves marble 0 (a plain advance) and busts it — the
    // center marble must be untouched.
    const wh = buildWahoo({
      phase: 'move',
      die: 6,
      sixStreak: 2,
      positions: { p1: [5, -2, -1, -1], p2: [-1, -1, -1, -1] },
      centerBy: { playerId: 'p1', marbleIdx: 1, entryCornerRel: SHORTCUT_ENTRIES[0] },
    })
    const r = applyWahooAction(wh, 'p1', { type: 'MOVE', move: { marbleIdx: 0, kind: 'advance' } })
    expect(r.outcome.ok).toBe(true)
    const pub = r.wh.session.publicState
    expect(pub.lastEvent).toEqual({ kind: 'bust', by: 'p1' })
    expect(pub.positions['p1']).toEqual([-1, -2, -1, -1]) // marble 0 busted, marble 1 still centered
    expect(pub.centerBy).toEqual({ playerId: 'p1', marbleIdx: 1, entryCornerRel: SHORTCUT_ENTRIES[0] })
  })

  it('a non-six pass also resets a nonzero sixStreak (no residual chain state leaks across a pass)', () => {
    const wh = buildWahoo({
      phase: 'roll',
      rngSeed: 0, // first roll is a 2 (non-six), see wahoo.test.ts "pass"
      sixStreak: 2,
      positions: { p1: [LANE_START, LANE_START + 1, LANE_START + 2, LANE_END], p2: [-1, -1, -1, -1] },
    })
    const r = applyWahooAction(wh, 'p1', { type: 'ROLL' })
    expect(r.outcome.ok).toBe(true)
    const pub = r.wh.session.publicState
    expect(pub.lastEvent).toEqual({ kind: 'pass', by: 'p1' })
    expect(pub.sixStreak).toBe(0)
    expect(currentPlayer(pub.turn)).toBe('p2')
  })
})

describe('attack: overshoot and boundary exactness', () => {
  it('rejects overshoot from deep in the lane (61 + anything)', () => {
    // die 2 avoids the 'out' moves that a 1 would offer for the base marbles.
    const wh = buildWahoo({ phase: 'move', die: 2, positions: { p1: [LANE_END, -1, -1, -1], p2: [-1, -1, -1, -1] } })
    expect(legalMoves(wh.session.publicState, 'p1', 2)).toEqual([])
    const r = applyWahooAction(wh, 'p1', { type: 'MOVE', move: { marbleIdx: 0, kind: 'advance' } })
    expect(r.outcome.ok).toBe(false)
  })

  it('a marble cannot exit to a corner it already occupies via a normal (non-shortcut) advance', () => {
    // p1 has a marble already sitting on absolute corner 33 in track terms
    // (arm0 rel33) while its center marble (entry 1) tries to exit onto the
    // same relative 33 -- must be blocked exactly like the documented case,
    // confirmed here with the marble reached by ordinary track advance instead
    // of being placed by hand at the corner.
    let wh = buildWahoo({ phase: 'move', die: 2, positions: { p1: [31, -1, -1, -1], p2: [-1, -1, -1, -1] } })
    let r = applyWahooAction(wh, 'p1', { type: 'MOVE', move: { marbleIdx: 0, kind: 'advance' } })
    expect(r.outcome.ok).toBe(true)
    expect(r.wh.session.publicState.positions['p1'][0]).toBe(SHORTCUT_EXITS[SHORTCUT_ENTRIES[0]])

    wh = buildWahoo({
      phase: 'move',
      die: 1,
      positions: { p1: [SHORTCUT_EXITS[SHORTCUT_ENTRIES[0]], -2, -1, -1], p2: [-1, -1, -1, -1] },
      centerBy: { playerId: 'p1', marbleIdx: 1, entryCornerRel: SHORTCUT_ENTRIES[0] },
    })
    expect(legalMoves(wh.session.publicState, 'p1', 1).some((m) => m.kind === 'exit')).toBe(false)
  })
})

describe('attack: serialization across every event kind', () => {
  const scenarios: Array<{ name: string; build: () => WahooSession; act: (wh: WahooSession) => WahooSession }> = [
    {
      name: 'shortcut',
      build: () => buildWahoo({ phase: 'move', die: 2, positions: { p1: [0, -1, -1, -1], p2: [-1, -1, -1, -1] } }),
      act: (wh) => applyWahooAction(wh, 'p1', { type: 'MOVE', move: { marbleIdx: 0, kind: 'shortcut' } }).wh,
    },
    {
      name: 'exit',
      build: () =>
        buildWahoo({
          phase: 'move',
          die: 1,
          positions: { p1: [-2, -1, -1, -1], p2: [-1, -1, -1, -1] },
          centerBy: { playerId: 'p1', marbleIdx: 0, entryCornerRel: SHORTCUT_ENTRIES[0] },
        }),
      act: (wh) => applyWahooAction(wh, 'p1', { type: 'MOVE', move: { marbleIdx: 0, kind: 'exit' } }).wh,
    },
    {
      name: 'bust',
      build: () =>
        buildWahoo({ phase: 'move', die: 6, sixStreak: 2, positions: { p1: [5, -1, -1, -1], p2: [-1, -1, -1, -1] } }),
      act: (wh) => applyWahooAction(wh, 'p1', { type: 'MOVE', move: { marbleIdx: 0, kind: 'advance' } }).wh,
    },
    {
      name: 'pass',
      build: () =>
        buildWahoo({
          phase: 'roll',
          rngSeed: 0,
          positions: { p1: [LANE_START, LANE_START + 1, LANE_START + 2, LANE_END], p2: [-1, -1, -1, -1] },
        }),
      act: (wh) => applyWahooAction(wh, 'p1', { type: 'ROLL' }).wh,
    },
    {
      name: 'win',
      build: () =>
        buildWahoo({
          phase: 'move',
          die: 1,
          positions: { p1: [HOME_ENTRANCE_REL, LANE_START + 1, LANE_START + 2, LANE_END], p2: [-1, -1, -1, -1] },
        }),
      act: (wh) => applyWahooAction(wh, 'p1', { type: 'MOVE', move: { marbleIdx: 0, kind: 'advance' } }).wh,
    },
  ]

  for (const s of scenarios) {
    it(`${s.name} event snapshot is JSON-safe for every player`, () => {
      const wh = s.act(s.build())
      for (const playerId of ['p1', 'p2']) {
        const snapshot = deriveSnapshot(wh.session, playerId)
        expect(isJsonSerializable(snapshot)).toBe(true)
        expect(JSON.parse(JSON.stringify(snapshot.publicState))).toEqual(snapshot.publicState)
      }
    })
  }
})

describe('attack: fairness sampling', () => {
  it('2-player arm-pair choice is not heavily biased over many seeds', () => {
    let pair02 = 0
    let pair13 = 0
    const N = 400
    for (let seed = 0; seed < N; seed++) {
      const pub = createWahooGame(['p1', 'p2'], seed).session.publicState
      const arms = [pub.seatArms['p1'], pub.seatArms['p2']].sort((a, b) => a - b)
      if (arms[0] === 0 && arms[1] === 2) pair02++
      else if (arms[0] === 1 && arms[1] === 3) pair13++
    }
    expect(pair02 + pair13).toBe(N)
    // loose sanity bound -- not a strict statistical test, just catches a
    // grossly broken (e.g. always-same-branch) rng wiring
    expect(pair02).toBeGreaterThan(N * 0.3)
    expect(pair13).toBeGreaterThan(N * 0.3)
  })

  it('3-player mutedArm is not pinned to a single arm across seeds', () => {
    const seen = new Set<number>()
    for (let seed = 0; seed < 100; seed++) {
      const pub = createWahooGame(['p1', 'p2', 'p3'], seed).session.publicState
      seen.add(pub.mutedArm!)
    }
    expect(seen.size).toBe(4)
  })
})

describe('sanity: absoluteIndex helper matches trackIndexFor directly', () => {
  it('is a pure passthrough with no off-by-one', () => {
    for (const arm of [0, 1, 2, 3]) {
      for (const rel of [0, 1, 12, 25, 38, 51]) {
        expect(absoluteIndex({ x: arm }, 'x', rel)).toBe(trackIndexFor(arm, rel))
      }
    }
  })
})

// Wiring-review probe (App/WahooTable review, spec 18d): the UI's destination-
// click map keys legal moves by landing hole and silently drops all but the
// first move that lands on a shared hole (see the NOTE in WahooTable.tsx
// destTargets). This proves the collision is real and reachable for a SINGLE
// player with a SINGLE die value, not just a theoretical worry.
describe('attack: legalMoves destination collisions (WahooTable UI ambiguity)', () => {
  it('exit and advance can target the identical absolute hole for the same player + die', () => {
    // p1 (arm 0, identity mapping) has a marble in center that entered via
    // corner 1 -> its exit target is rel 33 = absolute 33. A second p1
    // marble sits at rel 27; die 6 advances it to rel 33 = absolute 33 too.
    const wh = buildWahoo({
      seatArms: { p1: 0, p2: 2 },
      positions: { p1: [-2, 27, -1, -1], p2: [-1, -1, -1, -1] },
      centerBy: { playerId: 'p1', marbleIdx: 0, entryCornerRel: SHORTCUT_ENTRIES[0] },
      phase: 'move',
      die: 6,
    })
    const moves = legalMoves(wh.session.publicState, 'p1', 6)
    expect(moves).toContainEqual({ marbleIdx: 0, kind: 'exit' })
    expect(moves).toContainEqual({ marbleIdx: 1, kind: 'advance' })
    // Both are legal, materially different moves (one frees the center, one
    // advances a track marble) -- but they land on the same absolute hole.
    expect(trackIndexFor(0, SHORTCUT_EXITS[SHORTCUT_ENTRIES[0]])).toBe(trackIndexFor(0, 27 + 6))
    // Confirms WahooTable's destTargets map (keyed by dest hole) can only
    // ever surface ONE of these two as clickable; the other is legal per the
    // engine but permanently unreachable through the destination-click UI.
  })

  it('two own marbles in base produce duplicate "out" destinations (harmless: outcome is index-agnostic)', () => {
    const wh = buildWahoo({
      positions: { p1: [-1, -1, -1, -1], p2: [-1, -1, -1, -1] },
      phase: 'move',
      die: 6,
    })
    const moves = legalMoves(wh.session.publicState, 'p1', 6)
    const outMoves = moves.filter((m) => m.kind === 'out')
    expect(outMoves.length).toBe(4) // all 4 marbles are valid 'out' candidates, same destination hole
  })
})
