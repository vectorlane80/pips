import type { ActionOutcome, ActionValidator } from '../../card-engine/sync.ts'
import { applyAction } from '../../card-engine/sync.ts'
import { runBotTurn, type BotStrategy } from '../../card-engine/bot.ts'
import { advanceTurn, currentPlayer, setPhase, createTurnState } from '../../card-engine/turn-engine.ts'
import { moveCards, topCard, cardCount, createPlayerZone, recyclePile, type Zone } from '../../card-engine/zones.ts'
import { shuffleDeck } from '../../card-engine/deck.ts'
import { classifyMeld, hasMeldIncluding } from './melds.ts'
import { deadwood } from './scoring.ts'
import type { RummySession, RummyPublicState, RummyPrivateState, RummyAction, RummyPhase } from './state.ts'
import { dealRound } from './state.ts'

function finishRoundByGoingOut(
  publicState: RummyPublicState,
  privateStates: Record<string, RummyPrivateState>,
  playerId: string,
  newMeldsForPlayer: Zone[],
  newObligated: string | null,
  newDiscard?: Zone,
): ActionOutcome<RummyPublicState, RummyPrivateState> {
  const opponentId = publicState.turn.playerOrder.find((p) => p !== playerId)!
  const opponentHand = privateStates[opponentId].hand
  const opponentDeadwood = deadwood(opponentHand.cards)
  const newScores = {
    ...publicState.scores,
    [playerId]: publicState.scores[playerId] + opponentDeadwood,
  }
  const matchWinnerId = newScores[playerId] >= publicState.target ? playerId : null
  return {
    ok: true,
    publicState: {
      ...publicState,
      melds: { ...publicState.melds, [playerId]: newMeldsForPlayer },
      obligatedCardId: newObligated,
      ...(newDiscard ? { discardPile: newDiscard } : {}),
      scores: newScores,
      matchWinnerId,
      roundOver: true,
      roundWinnerId: playerId,
      handCounts: { ...publicState.handCounts, [playerId]: 0 },
    },
    privateStates,
  }
}

function makeValidator(
  currentStock: Zone,
  rng: () => number,
  onStockChange: (newStock: Zone) => void,
): ActionValidator<RummyPublicState, RummyPrivateState, RummyAction> {
  return (session, playerId, action) => {
    const { publicState, privateStates } = session

    // START_NEXT_ROUND is the one action NOT gated by "is it your turn" — either player may trigger
    // dealing a fresh round once the current one is over and the match isn't decided.
    if (action.type === 'START_NEXT_ROUND') {
      if (!Object.hasOwn(privateStates, playerId)) return { ok: false, reason: 'not a player in this match' }
      if (!publicState.roundOver || publicState.matchWinnerId) {
        return { ok: false, reason: 'round is not over, or the match is already decided' }
      }
      const [prevA, prevB] = publicState.turn.playerOrder
      const nextOrder: [string, string] = [prevB, prevA]   // alternate who starts each round
      const { p0Hand, p1Hand, stock: newStock, discardPile } = dealRound(nextOrder, rng)
      onStockChange(newStock)
      return {
        ok: true,
        publicState: {
          ...publicState,
          turn: createTurnState<RummyPhase>(nextOrder, 'draw'),
          discardPile,
          stockCount: cardCount(newStock),
          melds: { [nextOrder[0]]: [], [nextOrder[1]]: [] },
          obligatedCardId: null,
          roundNumber: publicState.roundNumber + 1,
          roundOver: false,
          roundWinnerId: null,
          handCounts: { [nextOrder[0]]: cardCount(p0Hand), [nextOrder[1]]: cardCount(p1Hand) },
        },
        privateStates: { [nextOrder[0]]: { hand: p0Hand }, [nextOrder[1]]: { hand: p1Hand } },
      }
    }

    const isMyTurn = currentPlayer(publicState.turn) === playerId
    const myHand = privateStates[playerId]?.hand
    if (!isMyTurn || !myHand) {
      return { ok: false, reason: 'not your turn' }
    }

    if (action.type === 'DRAW_FROM_STOCK') {
      if (publicState.turn.phase !== 'draw') return { ok: false, reason: 'not draw phase' }
      if (cardCount(currentStock) > 0) {
        const top = topCard(currentStock)!
        const { from: newStock, to: newHand } = moveCards(currentStock, myHand, [top.id])
        onStockChange(newStock)
        return {
          ok: true,
          publicState: {
            ...publicState,
            turn: setPhase(publicState.turn, 'discard'),
            stockCount: cardCount(newStock),
            handCounts: { ...publicState.handCounts, [playerId]: cardCount(newHand) },
          },
          privateStates: { ...privateStates, [playerId]: { hand: newHand } },
        }
      }
      // stock is empty — try to recycle the discard pile (keep its current top card in place)
      if (cardCount(publicState.discardPile) >= 2) {
        const { source: newDiscard, dest: recycledStock } = recyclePile(
          publicState.discardPile,
          currentStock,
          { keepTop: 1, shuffle: (cards) => shuffleDeck(cards, rng) },
        )
        const top = topCard(recycledStock)!
        const { from: newStock, to: newHand } = moveCards(recycledStock, myHand, [top.id])
        onStockChange(newStock)
        return {
          ok: true,
          publicState: {
            ...publicState,
            turn: setPhase(publicState.turn, 'discard'),
            discardPile: newDiscard,
            stockCount: cardCount(newStock),
            handCounts: { ...publicState.handCounts, [playerId]: cardCount(newHand) },
          },
          privateStates: { ...privateStates, [playerId]: { hand: newHand } },
        }
      }
      // can't recycle (discard has 0 or 1 cards) — if discard is completely empty too, nobody can draw
      // anything at all this turn: the round is blocked. Otherwise, the player should draw from the
      // discard pile instead (it still has exactly 1 card available).
      if (cardCount(publicState.discardPile) === 0) {
        return {
          ok: true,
          publicState: { ...publicState, roundOver: true, roundWinnerId: null },
          privateStates,
        }
      }
      return { ok: false, reason: 'stock is empty — draw from the discard pile instead' }
    }

    if (action.type === 'DRAW_FROM_DISCARD') {
      if (publicState.turn.phase !== 'draw') return { ok: false, reason: 'not draw phase' }
      const pile = publicState.discardPile.cards
      if (pile.length === 0) return { ok: false, reason: 'discard pile is empty' }
      if (!Number.isInteger(action.index) || action.index < 0 || action.index >= pile.length) return { ok: false, reason: 'invalid index' }
      const takenIds = pile.slice(action.index).map((c) => c.id)
      const reachedCardId = pile[action.index].id
      if (takenIds.length > 1) {
        const takenCards = pile.slice(action.index)
        const resultingHandCards = [...myHand.cards, ...takenCards]
        if (!hasMeldIncluding(resultingHandCards, reachedCardId)) {
          return { ok: false, reason: 'that card cannot be melded — reach for a different card, or draw just the top card instead' }
        }
      }
      const { from: newDiscard, to: newHand } = moveCards(publicState.discardPile, myHand, takenIds)
      const obligated = takenIds.length > 1 ? reachedCardId : null
      return {
        ok: true,
        publicState: {
          ...publicState,
          turn: setPhase(publicState.turn, 'discard'),
          discardPile: newDiscard,
          obligatedCardId: obligated,
          handCounts: { ...publicState.handCounts, [playerId]: cardCount(newHand) },
        },
        privateStates: { ...privateStates, [playerId]: { hand: newHand } },
      }
    }

    if (action.type === 'LAY_DOWN_MELD') {
      if (publicState.turn.phase !== 'discard') return { ok: false, reason: 'draw first' }
      if (!Array.isArray(action.cardIds)) return { ok: false, reason: 'invalid cardIds' }
      const selected = myHand.cards.filter((c) => action.cardIds.includes(c.id))
      if (selected.length !== action.cardIds.length) return { ok: false, reason: 'card not in hand' }
      const classification = classifyMeld(selected)
      if (!classification.valid) return { ok: false, reason: 'not a valid set or run' }
      const meldZoneName = `meld-${publicState.melds[playerId]?.length ?? 0}`
      const { from: newHand, to: meldZone } = moveCards(myHand, createPlayerZone(playerId, meldZoneName, 'public'), action.cardIds)
      const newMeldsForPlayer = [...(publicState.melds[playerId] ?? []), meldZone]
      const newObligated = publicState.obligatedCardId && action.cardIds.includes(publicState.obligatedCardId)
        ? null
        : publicState.obligatedCardId

      if (cardCount(newHand) === 0) {
        return finishRoundByGoingOut(publicState, { ...privateStates, [playerId]: { hand: newHand } }, playerId, newMeldsForPlayer, newObligated)
      }
      return {
        ok: true,
        publicState: { ...publicState, melds: { ...publicState.melds, [playerId]: newMeldsForPlayer }, obligatedCardId: newObligated, handCounts: { ...publicState.handCounts, [playerId]: cardCount(newHand) } },
        privateStates: { ...privateStates, [playerId]: { hand: newHand } },
      }
    }

    if (action.type === 'DISCARD_CARD') {
      if (publicState.turn.phase !== 'discard') return { ok: false, reason: 'draw first' }
      if (publicState.obligatedCardId) {
        return { ok: false, reason: 'you must use the card you reached for in a meld before discarding' }
      }
      const hasCard = myHand.cards.some((c) => c.id === action.cardId)
      if (!hasCard) return { ok: false, reason: 'card not in hand' }
      const { from: newHand, to: newDiscard } = moveCards(myHand, publicState.discardPile, [action.cardId])

      if (cardCount(newHand) === 0) {
        return finishRoundByGoingOut(publicState, { ...privateStates, [playerId]: { hand: newHand } }, playerId, publicState.melds[playerId] ?? [], null, newDiscard)
      }
      return {
        ok: true,
        publicState: { ...publicState, turn: advanceTurn(publicState.turn, 'draw'), discardPile: newDiscard, handCounts: { ...publicState.handCounts, [playerId]: cardCount(newHand) } },
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
  const validate = makeValidator(rummy.stock, rummy.rng, (s) => { candidateStock = s })
  const { session, outcome } = applyAction(rummy.session, playerId, action, validate)
  const stock = outcome.ok ? candidateStock : rummy.stock
  return { rummy: { session, stock, rng: rummy.rng }, outcome }
}

export function runRummyBotTurn(
  rummy: RummySession,
  playerId: string,
  strategy: BotStrategy<RummyPublicState, RummyPrivateState, RummyAction>,
): { rummy: RummySession; outcome: ActionOutcome<RummyPublicState, RummyPrivateState> } {
  let candidateStock = rummy.stock
  const validate = makeValidator(rummy.stock, rummy.rng, (s) => { candidateStock = s })
  const { session, outcome } = runBotTurn(rummy.session, playerId, strategy, validate)
  const stock = outcome.ok ? candidateStock : rummy.stock
  return { rummy: { session, stock, rng: rummy.rng }, outcome }
}
