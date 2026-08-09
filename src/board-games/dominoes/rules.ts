import type { ActionOutcome, ActionValidator } from '../../engine/sync.ts'
import { applyAction } from '../../engine/sync.ts'
import { runBotTurn, type BotStrategy } from '../../engine/bot.ts'
import { advanceTurn, currentPlayer, createTurnState } from '../../engine/turn-engine.ts'
import { moveCards, removeCardsById, topCard, cardCount, type Zone } from '../../card-engine/zones.ts'
import { boardTotal, scoreForTotal, pipSum, roundDownToFive } from './scoring.ts'
import { dealRound, endValue, legalArms, handHasLegalPlay } from './state.ts'
import type {
  DominoTile,
  DominoesAction,
  DominoesPrivateState,
  DominoesPublicState,
  DominoesRoundResult,
  DominoesSession,
  DominoesStage,
  PlacedTile,
} from './state.ts'

// Sets stage 'roundEnd' (or 'over' with a match winner) and records the round result. A round
// closes with the match only when some score is at/above target AND the scores are not equal —
// a tied ≥ target keeps playing.
function finishRound(
  publicState: DominoesPublicState,
  privateStates: Record<string, DominoesPrivateState>,
  kind: DominoesRoundResult['kind'],
  scorerId: string | null,
  points: number,
): ActionOutcome<DominoesPublicState, DominoesPrivateState> {
  const scores =
    scorerId === null
      ? publicState.scores
      : { ...publicState.scores, [scorerId]: publicState.scores[scorerId] + points }
  const [a, b] = publicState.turn.playerOrder
  const atTarget = scores[a] >= publicState.target || scores[b] >= publicState.target
  const stage: DominoesStage = atTarget && scores[a] !== scores[b] ? 'over' : 'roundEnd'
  const matchWinnerId = stage === 'over' ? (scores[a] > scores[b] ? a : b) : null
  return {
    ok: true,
    publicState: {
      ...publicState,
      stage,
      matchWinnerId,
      roundResult: { kind, scorerId, points },
      scores,
    },
    privateStates,
  }
}

function makeValidator(
  boneyard: Zone<DominoTile>,
  rng: () => number,
  setBoneyard: (newBoneyard: Zone<DominoTile>) => void,
): ActionValidator<DominoesPublicState, DominoesPrivateState, DominoesAction> {
  return (session, playerId, action) => {
    const { publicState, privateStates } = session

    // START_NEXT_ROUND is the one action NOT gated by "is it your turn" — either player may
    // trigger dealing a fresh round once the current one is over and the match isn't decided.
    if (action.type === 'START_NEXT_ROUND') {
      if (!Object.hasOwn(privateStates, playerId)) return { ok: false, reason: 'not a player in this match' }
      if (publicState.stage !== 'roundEnd') return { ok: false, reason: 'the round is not over' }
      const starter = publicState.turn.playerOrder.find((p) => p !== publicState.roundStarterId)!
      const nextOrder: [string, string] = [starter, publicState.roundStarterId]
      const { p0Hand, p1Hand, boneyard: newBoneyard } = dealRound(nextOrder, rng)
      setBoneyard(newBoneyard)
      return {
        ok: true,
        publicState: {
          ...publicState,
          stage: 'play',
          turn: createTurnState<'play'>(nextOrder, 'play'),
          center: null,
          isSpinner: false,
          arms: { right: [], left: [], up: [], down: [] },
          boneyardCount: cardCount(newBoneyard),
          handCounts: { [nextOrder[0]]: cardCount(p0Hand), [nextOrder[1]]: cardCount(p1Hand) },
          passStreak: 0,
          roundNumber: publicState.roundNumber + 1,
          roundStarterId: starter,
          roundResult: null,
          lastAction: null,
        },
        privateStates: { [nextOrder[0]]: { hand: p0Hand }, [nextOrder[1]]: { hand: p1Hand } },
      }
    }

    if (publicState.stage !== 'play') return { ok: false, reason: 'the round is not in play' }
    if (currentPlayer(publicState.turn) !== playerId) return { ok: false, reason: 'not your turn' }

    const myHand = privateStates[playerId].hand

    if (action.type === 'PLAY_TILE') {
      const tile = myHand.cards.find((t) => t.id === action.tileId)
      if (!tile) return { ok: false, reason: 'tile not in hand' }
      const arms = legalArms(tile, publicState)
      if (!arms.includes(action.arm)) return { ok: false, reason: 'tile cannot be played there' }

      const { zone: newHand } = removeCardsById(myHand, [tile.id])

      let center = publicState.center
      let isSpinner = publicState.isSpinner
      let newArms = publicState.arms
      if (action.arm === 'center') {
        center = { a: tile.a, b: tile.b }
        isSpinner = tile.a === tile.b
      } else {
        const value = endValue(center, isSpinner, publicState.arms, action.arm)!
        const placedTile: PlacedTile = {
          inner: value,
          outer: value === tile.a ? tile.b : tile.a,
          isDouble: tile.a === tile.b,
        }
        newArms = { ...publicState.arms, [action.arm]: [...publicState.arms[action.arm], placedTile] }
      }

      const scored = scoreForTotal(boardTotal(center, isSpinner, newArms))
      const newPublicState: DominoesPublicState = {
        ...publicState,
        center,
        isSpinner,
        arms: newArms,
        handCounts: { ...publicState.handCounts, [playerId]: cardCount(newHand) },
        passStreak: 0,
        scores: { ...publicState.scores, [playerId]: publicState.scores[playerId] + scored },
        lastAction: {
          by: playerId,
          kind: action.arm === 'center' ? 'lead' : 'play',
          tile: { a: tile.a, b: tile.b },
          arm: action.arm,
          scored,
        },
      }
      const newPrivateStates = { ...privateStates, [playerId]: { hand: newHand } }

      // Going out: the opponent's remaining pips (rounded down) are credited on top of any
      // points the final play itself scored.
      if (cardCount(newHand) === 0) {
        const opponentId = publicState.turn.playerOrder.find((p) => p !== playerId)!
        const points = roundDownToFive(pipSum(privateStates[opponentId].hand.cards))
        return finishRound(newPublicState, newPrivateStates, 'out', playerId, points)
      }

      return {
        ok: true,
        publicState: { ...newPublicState, turn: advanceTurn(publicState.turn, 'play') },
        privateStates: newPrivateStates,
      }
    }

    if (action.type === 'DRAW_TILE') {
      if (handHasLegalPlay(myHand.cards, publicState)) return { ok: false, reason: 'you have a legal play' }
      if (cardCount(boneyard) === 0) return { ok: false, reason: 'the boneyard is empty — pass' }
      const top = topCard(boneyard)!
      const { from: newBoneyard, to: newHand } = moveCards(boneyard, myHand, [top.id])
      setBoneyard(newBoneyard)
      // Turn unchanged — the same player keeps acting until they can play (or pass).
      return {
        ok: true,
        publicState: {
          ...publicState,
          boneyardCount: cardCount(newBoneyard),
          handCounts: { ...publicState.handCounts, [playerId]: cardCount(newHand) },
          passStreak: 0,
          lastAction: { by: playerId, kind: 'draw', tile: null, arm: null, scored: 0 },
        },
        privateStates: { ...privateStates, [playerId]: { hand: newHand } },
      }
    }

    if (action.type === 'PASS') {
      if (handHasLegalPlay(myHand.cards, publicState)) return { ok: false, reason: 'you have a legal play' }
      if (cardCount(boneyard) > 0) return { ok: false, reason: 'the boneyard is not empty — draw' }
      const newPublicState: DominoesPublicState = {
        ...publicState,
        passStreak: publicState.passStreak + 1,
        lastAction: { by: playerId, kind: 'pass', tile: null, arm: null, scored: 0 },
      }
      if (newPublicState.passStreak >= 2) {
        // Blocked: the lower pip total scores both hands' pips rounded down; a tie scores nobody.
        const [a, b] = publicState.turn.playerOrder
        const aPips = pipSum(privateStates[a].hand.cards)
        const bPips = pipSum(privateStates[b].hand.cards)
        if (aPips === bPips) {
          return finishRound(newPublicState, privateStates, 'blocked', null, 0)
        }
        const scorerId = aPips < bPips ? a : b
        return finishRound(newPublicState, privateStates, 'blocked', scorerId, roundDownToFive(aPips + bPips))
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

export function applyDominoesAction(
  dm: DominoesSession,
  playerId: string,
  action: DominoesAction,
): { dm: DominoesSession; outcome: ActionOutcome<DominoesPublicState, DominoesPrivateState> } {
  let candidateBoneyard = dm.boneyard
  const validate = makeValidator(dm.boneyard, dm.rng, (b) => { candidateBoneyard = b })
  const { session, outcome } = applyAction(dm.session, playerId, action, validate)
  const boneyard = outcome.ok ? candidateBoneyard : dm.boneyard
  return { dm: { session, boneyard, rng: dm.rng }, outcome }
}

export function runDominoesBotTurn(
  dm: DominoesSession,
  playerId: string,
  strategy: BotStrategy<DominoesPublicState, DominoesPrivateState, DominoesAction>,
): { dm: DominoesSession; outcome: ActionOutcome<DominoesPublicState, DominoesPrivateState> } {
  let candidateBoneyard = dm.boneyard
  const validate = makeValidator(dm.boneyard, dm.rng, (b) => { candidateBoneyard = b })
  const { session, outcome } = runBotTurn(dm.session, playerId, strategy, validate)
  const boneyard = outcome.ok ? candidateBoneyard : dm.boneyard
  return { dm: { session, boneyard, rng: dm.rng }, outcome }
}
