import type { ActionOutcome, ActionValidator } from '../../engine/sync.ts'
import { applyAction } from '../../engine/sync.ts'
import { runBotTurn, type BotStrategy } from '../../engine/bot.ts'
import { advanceTurn, currentPlayer, createTurnState } from '../../engine/turn-engine.ts'
import { cardCount, moveCards, removeCardsById, topCard, type Zone } from '../../card-engine/zones.ts'
import { createMTOpen, createMTTrains, dealMTRound, handHasLegalPlay, laneEnd, legalLanes } from './state.ts'
import type {
  MTAction,
  MTLaneKey,
  MTPlacedTile,
  MTPrivateState,
  MTPublicState,
  MTRoundResult,
  MTSession,
  MTStage,
  MTTile,
} from './state.ts'

// Adds each player's remaining pip total to the running scores (the out-player's is 0) and
// closes the round: 'roundEnd', or 'over' with the lowest-total winner after round 12 (ties
// go to the tied player earliest in seatOrder).
function finishRound(
  publicState: MTPublicState,
  privateStates: Record<string, MTPrivateState>,
  kind: MTRoundResult['kind'],
  outPlayerId: string | null,
): ActionOutcome<MTPublicState, MTPrivateState> {
  const pips: Record<string, number> = {}
  const scores = { ...publicState.scores }
  for (const playerId of publicState.seatOrder) {
    const left =
      playerId === outPlayerId
        ? 0
        : privateStates[playerId].hand.cards.reduce((sum, t) => sum + t.a + t.b, 0)
    pips[playerId] = left
    scores[playerId] = scores[playerId] + left
  }
  let stage: MTStage = 'roundEnd'
  let matchWinnerId: string | null = null
  if (publicState.round === 12) {
    stage = 'over'
    matchWinnerId = publicState.seatOrder[0]
    for (const playerId of publicState.seatOrder.slice(1)) {
      if (scores[playerId] < scores[matchWinnerId]) matchWinnerId = playerId
    }
  }
  return {
    ok: true,
    publicState: {
      ...publicState,
      stage,
      matchWinnerId,
      roundResult: { kind, outPlayerId, pips },
      scores,
    },
    privateStates,
  }
}

function makeValidator(
  boneyard: Zone<MTTile>,
  rng: () => number,
  setBoneyard: (newBoneyard: Zone<MTTile>) => void,
): ActionValidator<MTPublicState, MTPrivateState, MTAction> {
  return (session, playerId, action) => {
    const { publicState, privateStates } = session

    // START_NEXT_ROUND is the one action NOT gated by "is it your turn" — any seated player may
    // trigger dealing a fresh round once the current one is over and the match isn't decided.
    if (action.type === 'START_NEXT_ROUND') {
      if (!Object.hasOwn(privateStates, playerId)) return { ok: false, reason: 'not a player in this match' }
      if (publicState.stage !== 'roundEnd') return { ok: false, reason: 'the round is not over' }
      const nextRound = publicState.round + 1
      const { hands, boneyard: newBoneyard, engine } = dealMTRound(publicState.seatOrder, nextRound, rng)
      setBoneyard(newBoneyard)
      // The new round's starter is seat (round + 1) % seatCount.
      let turn = createTurnState<'play'>(publicState.seatOrder, 'play')
      for (let i = 0; i < nextRound % publicState.seatOrder.length; i++) turn = advanceTurn(turn, 'play')
      const handCounts: Record<string, number> = {}
      const newPrivateStates: Record<string, MTPrivateState> = {}
      for (const seatedPlayer of publicState.seatOrder) {
        handCounts[seatedPlayer] = cardCount(hands[seatedPlayer])
        newPrivateStates[seatedPlayer] = { hand: hands[seatedPlayer] }
      }
      return {
        ok: true,
        publicState: {
          ...publicState,
          stage: 'play',
          turn,
          round: nextRound,
          engine,
          trains: createMTTrains(publicState.seatOrder.length),
          open: createMTOpen(publicState.seatOrder.length),
          boneyardCount: cardCount(newBoneyard),
          handCounts,
          doublePending: false,
          passStreak: 0,
          roundResult: null,
          lastAction: null,
        },
        privateStates: newPrivateStates,
      }
    }

    if (publicState.stage !== 'play') return { ok: false, reason: 'the round is not in play' }
    if (currentPlayer(publicState.turn) !== playerId) return { ok: false, reason: 'not your turn' }

    const seat = publicState.seatOrder.indexOf(playerId)
    const ownLane = ('p' + seat) as MTLaneKey
    const myHand = privateStates[playerId].hand

    if (action.type === 'PLAY_TILE') {
      const tile = myHand.cards.find((t) => t.id === action.tileId)
      if (!tile) return { ok: false, reason: 'tile not in hand' }
      const lanes = legalLanes(tile, seat, publicState)
      if (!lanes.includes(action.lane)) return { ok: false, reason: 'tile cannot be played there' }

      const { zone: newHand } = removeCardsById(myHand, [tile.id])
      const end = laneEnd(publicState, action.lane)
      const placedTile: MTPlacedTile = {
        inner: end,
        outer: end === tile.a ? tile.b : tile.a,
        isDouble: tile.a === tile.b,
      }
      const newTrains: Record<string, MTPlacedTile[]> = {
        ...publicState.trains,
        [action.lane]: [...publicState.trains[action.lane], placedTile],
      }
      // Playing on one's own train clears its open flag; the mex train and open opponents' trains
      // are untouched (only their owner's play can close them).
      const newOpen = action.lane === ownLane ? { ...publicState.open, [ownLane]: false } : publicState.open
      const newPublicState: MTPublicState = {
        ...publicState,
        trains: newTrains,
        open: newOpen,
        handCounts: { ...publicState.handCounts, [playerId]: cardCount(newHand) },
        passStreak: 0,
        lastAction: {
          by: playerId,
          kind: 'play',
          tile: { a: tile.a, b: tile.b },
          lane: action.lane,
          double: tile.a === tile.b,
          opened: null,
        },
      }
      const newPrivateStates = { ...privateStates, [playerId]: { hand: newHand } }

      // Going out ends the round immediately — even when the final tile was a double.
      if (cardCount(newHand) === 0) {
        return finishRound(newPublicState, newPrivateStates, 'out', playerId)
      }
      if (tile.a === tile.b) {
        return { ok: true, publicState: { ...newPublicState, doublePending: true }, privateStates: newPrivateStates }
      }
      return {
        ok: true,
        publicState: { ...newPublicState, doublePending: false, turn: advanceTurn(publicState.turn, 'play') },
        privateStates: newPrivateStates,
      }
    }

    if (action.type === 'DRAW_TILE') {
      if (handHasLegalPlay(myHand.cards, seat, publicState)) return { ok: false, reason: 'you have a legal play' }
      if (cardCount(boneyard) === 0) return { ok: false, reason: 'the boneyard is empty — pass' }
      const top = topCard(boneyard)!
      const { from: newBoneyard, to: newHand } = moveCards(boneyard, myHand, [top.id])
      setBoneyard(newBoneyard)
      if (legalLanes(top, seat, publicState).length > 0) {
        // The drawn tile is playable — turn stays with the player, who must now play it.
        return {
          ok: true,
          publicState: {
            ...publicState,
            boneyardCount: cardCount(newBoneyard),
            handCounts: { ...publicState.handCounts, [playerId]: cardCount(newHand) },
            passStreak: 0,
            lastAction: { by: playerId, kind: 'draw', tile: null, lane: null, double: false, opened: null },
          },
          privateStates: { ...privateStates, [playerId]: { hand: newHand } },
        }
      }
      // Dead draw: the player's own train is marked open and their turn ends.
      return {
        ok: true,
        publicState: {
          ...publicState,
          open: { ...publicState.open, [ownLane]: true },
          boneyardCount: cardCount(newBoneyard),
          handCounts: { ...publicState.handCounts, [playerId]: cardCount(newHand) },
          doublePending: false,
          passStreak: 0,
          turn: advanceTurn(publicState.turn, 'play'),
          lastAction: { by: playerId, kind: 'draw', tile: null, lane: null, double: false, opened: ownLane },
        },
        privateStates: { ...privateStates, [playerId]: { hand: newHand } },
      }
    }

    if (action.type === 'PASS') {
      if (handHasLegalPlay(myHand.cards, seat, publicState)) return { ok: false, reason: 'you have a legal play' }
      if (cardCount(boneyard) > 0) return { ok: false, reason: 'the boneyard is not empty — draw' }
      const newPublicState: MTPublicState = {
        ...publicState,
        open: { ...publicState.open, [ownLane]: true },
        doublePending: false,
        passStreak: publicState.passStreak + 1,
        lastAction: { by: playerId, kind: 'pass-open', tile: null, lane: null, double: false, opened: ownLane },
      }
      if (newPublicState.passStreak >= publicState.seatOrder.length) {
        return finishRound(newPublicState, privateStates, 'blocked', null)
      }
      return {
        ok: true,
        publicState: { ...newPublicState, turn: advanceTurn(publicState.turn, 'play') },
        privateStates,
      }
    }

    return { ok: false, reason: 'unknown action' }
  }
}

export function applyMTAction(
  mt: MTSession,
  playerId: string,
  action: MTAction,
): { mt: MTSession; outcome: ActionOutcome<MTPublicState, MTPrivateState> } {
  let candidateBoneyard = mt.boneyard
  const validate = makeValidator(mt.boneyard, mt.rng, (b) => { candidateBoneyard = b })
  const { session, outcome } = applyAction(mt.session, playerId, action, validate)
  const boneyard = outcome.ok ? candidateBoneyard : mt.boneyard
  return { mt: { session, boneyard, rng: mt.rng }, outcome }
}

export function runMTBotTurn(
  mt: MTSession,
  playerId: string,
  strategy: BotStrategy<MTPublicState, MTPrivateState, MTAction>,
): { mt: MTSession; outcome: ActionOutcome<MTPublicState, MTPrivateState> } {
  let candidateBoneyard = mt.boneyard
  const validate = makeValidator(mt.boneyard, mt.rng, (b) => { candidateBoneyard = b })
  const { session, outcome } = runBotTurn(mt.session, playerId, strategy, validate)
  const boneyard = outcome.ok ? candidateBoneyard : mt.boneyard
  return { mt: { session, boneyard, rng: mt.rng }, outcome }
}
