import type { ActionOutcome, ActionValidator } from '../../card-engine/sync.ts'
import { applyAction } from '../../card-engine/sync.ts'
import { runBotTurn, type BotStrategy } from '../../card-engine/bot.ts'
import { advanceTurn, currentPlayer, setPhase } from '../../card-engine/turn-engine.ts'
import { moveCards, topCard, cardCount, type Zone } from '../../card-engine/zones.ts'
import type { RummySession, RummyPublicState, RummyPrivateState, RummyAction } from './state.ts'

function makeValidator(
  currentStock: Zone,
  onStockChange: (newStock: Zone) => void,
): ActionValidator<RummyPublicState, RummyPrivateState, RummyAction> {
  return (session, playerId, action) => {
    const { publicState, privateStates } = session
    const isMyTurn = currentPlayer(publicState.turn) === playerId
    const myHand = privateStates[playerId]?.hand

    if (!isMyTurn || !myHand) {
      return { ok: false, reason: 'not your turn' }
    }

    if (action.type === 'DRAW_FROM_STOCK') {
      if (publicState.turn.phase !== 'draw') return { ok: false, reason: 'not draw phase' }
      const top = topCard(currentStock)
      if (!top) return { ok: false, reason: 'stock is empty' }
      const { from: newStock, to: newHand } = moveCards(currentStock, myHand, [top.id])
      onStockChange(newStock)
      return {
        ok: true,
        publicState: { ...publicState, turn: setPhase(publicState.turn, 'discard'), stockCount: cardCount(newStock) },
        privateStates: { ...privateStates, [playerId]: { hand: newHand } },
      }
    }

    if (action.type === 'DRAW_FROM_DISCARD') {
      if (publicState.turn.phase !== 'draw') return { ok: false, reason: 'not draw phase' }
      const top = topCard(publicState.discardPile)
      if (!top) return { ok: false, reason: 'discard pile is empty' }
      const { from: newDiscard, to: newHand } = moveCards(publicState.discardPile, myHand, [top.id])
      return {
        ok: true,
        publicState: { ...publicState, turn: setPhase(publicState.turn, 'discard'), discardPile: newDiscard },
        privateStates: { ...privateStates, [playerId]: { hand: newHand } },
      }
    }

    if (action.type === 'DISCARD_CARD') {
      if (publicState.turn.phase !== 'discard') return { ok: false, reason: 'not discard phase' }
      const hasCard = myHand.cards.some((c) => c.id === action.cardId)
      if (!hasCard) return { ok: false, reason: 'card not in hand' }
      const { from: newHand, to: newDiscard } = moveCards(myHand, publicState.discardPile, [action.cardId])
      return {
        ok: true,
        publicState: { ...publicState, turn: advanceTurn(publicState.turn, 'draw'), discardPile: newDiscard },
        privateStates: { ...privateStates, [playerId]: { hand: newHand } },
      }
    }

    return { ok: false, reason: 'unknown action' }
  }
}

export function applyRummyAction(
  rummy: RummySession,
  playerId: string,
  action: RummyAction,
): { rummy: RummySession; outcome: ActionOutcome<RummyPublicState, RummyPrivateState> } {
  let candidateStock = rummy.stock
  const validate = makeValidator(rummy.stock, (s) => { candidateStock = s })
  const { session, outcome } = applyAction(rummy.session, playerId, action, validate)
  const stock = outcome.ok ? candidateStock : rummy.stock
  return { rummy: { session, stock }, outcome }
}

export function runRummyBotTurn(
  rummy: RummySession,
  playerId: string,
  strategy: BotStrategy<RummyPublicState, RummyPrivateState, RummyAction>,
): { rummy: RummySession; outcome: ActionOutcome<RummyPublicState, RummyPrivateState> } {
  let candidateStock = rummy.stock
  const validate = makeValidator(rummy.stock, (s) => { candidateStock = s })
  const { session, outcome } = runBotTurn(rummy.session, playerId, strategy, validate)
  const stock = outcome.ok ? candidateStock : rummy.stock
  return { rummy: { session, stock }, outcome }
}
