import type { Card } from '../../card-engine/cards.ts'
import type { ActionOutcome, HostSession } from '../../engine/sync.ts'
import { applyAction } from '../../engine/sync.ts'
import { runBotTurn, type BotStrategy } from '../../engine/bot.ts'
import { advanceTurn, currentPlayer } from '../../engine/turn-engine.ts'
import { moveCards, removeCardsById, topCard, cardCount, addCards, recyclePile, type Zone } from '../../card-engine/zones.ts'
import { shuffleDeck } from '../../card-engine/deck.ts'
import type { SkipBoSession, SkipBoPublicState, SkipBoPrivateState, SkipBoAction, SkipBoBuildPile } from './state.ts'

// The engine's shared ActionOutcome can't carry game-specific host-only zones. Skip-Bo's
// validator still needs to report how drawPile/usedPile changed, so rules.ts extends the outcome
// locally and returns the two zones directly — no output-parameter callbacks.
type SkipBoOutcome = ActionOutcome<SkipBoPublicState, SkipBoPrivateState> & {
  drawPile?: Zone
  usedPile?: Zone
}

type SkipBoValidator = (
  session: HostSession<SkipBoPublicState, SkipBoPrivateState>,
  playerId: string,
  action: SkipBoAction,
) => SkipBoOutcome

// ── Building-pile legality and auto-targeting (shared by PLAY_STOCK / PLAY_HAND / PLAY_DISCARD) ──

// The single auto-target: among all piles where the card is legal, pick the one with the most
// cards already stacked (furthest along); ties go to the lowest index. -1 if legal on no pile.
export function chooseBuildPile(card: Card, buildPiles: SkipBoBuildPile[]): number {
  let best = -1
  let bestLength = -1
  for (let i = 0; i < buildPiles.length; i++) {
    const pile = buildPiles[i]
    const legal = card.meta?.kind === 'wild' || Number(card.rank) === pile.nextNeeded
    if (legal && pile.cards.length > bestLength) {
      bestLength = pile.cards.length
      best = i
    }
  }
  return best
}

// Shared effect of a legal play once the target pile is chosen: the card joins the pile. If
// nextNeeded was 12 (the just-played card completed the pile) all its cards — including the
// just-played one — move into the used/reshuffle pool and the pile restarts at 1; otherwise
// nextNeeded increments.
function playCardOntoPile(
  card: Card,
  pileIndex: number,
  buildPiles: SkipBoBuildPile[],
  usedPile: Zone,
): { buildPiles: SkipBoBuildPile[]; usedPile: Zone } {
  const pile = buildPiles[pileIndex]
  const stacked = [...pile.cards, card]
  if (pile.nextNeeded === 12) {
    return {
      buildPiles: buildPiles.map((p, i) => (i === pileIndex ? { cards: [], nextNeeded: 1 } : p)),
      usedPile: addCards(usedPile, stacked),
    }
  }
  return {
    buildPiles: buildPiles.map((p, i) => (i === pileIndex ? { cards: stacked, nextNeeded: p.nextNeeded + 1 } : p)),
    usedPile,
  }
}

// The auto-draw folded into DISCARD/PASS's turn advance: draw from the shared draw pile until
// the new current player's hand has 5 cards or the draw pile is empty; if the draw pile empties
// first, recycle the WHOLE used pool into it (shuffled, no keepTop — unlike Rummy's discard
// there's no "must stay visible" top card here) and keep drawing. If BOTH piles are empty,
// stop and leave the hand short — never throws, never blocks the game.
function drawToFive(
  drawPile: Zone,
  usedPile: Zone,
  hand: Zone,
  rng: () => number,
): { drawPile: Zone; usedPile: Zone; hand: Zone } {
  let draw = drawPile
  let used = usedPile
  let target = hand
  while (cardCount(target) < 5) {
    if (cardCount(draw) === 0) {
      if (cardCount(used) === 0) break
      const recycled = recyclePile(used, draw, { shuffle: (cards) => shuffleDeck(cards, rng) })
      draw = recycled.dest
      used = recycled.source
    }
    const top = topCard(draw)!
    const { from, to } = moveCards(draw, target, [top.id])
    draw = from
    target = to
  }
  return { drawPile: draw, usedPile: used, hand: target }
}

// The turn-ending sequence shared by DISCARD and PASS: advance to the next seat, then auto-draw
// the new current player's hand back up to 5 — one state transition either way.
function endTurnAndDrawToFive(
  publicState: SkipBoPublicState,
  privateStates: Record<string, SkipBoPrivateState>,
  drawPile: Zone,
  usedPile: Zone,
  rng: () => number,
): {
  publicState: SkipBoPublicState
  privateStates: Record<string, SkipBoPrivateState>
  drawPile: Zone
  usedPile: Zone
} {
  const nextTurn = advanceTurn(publicState.turn, 'play')
  const nextPlayerId = currentPlayer(nextTurn)
  const nextState = privateStates[nextPlayerId]
  const { drawPile: newDraw, usedPile: newUsed, hand: newNextHand } = drawToFive(drawPile, usedPile, nextState.hand, rng)
  return {
    publicState: {
      ...publicState,
      turn: nextTurn,
      drawCount: cardCount(newDraw),
      usedCount: cardCount(newUsed),
      handCounts: { ...publicState.handCounts, [nextPlayerId]: cardCount(newNextHand) },
    },
    privateStates: { ...privateStates, [nextPlayerId]: { ...nextState, hand: newNextHand } },
    drawPile: newDraw,
    usedPile: newUsed,
  }
}

function makeValidator(
  currentDrawPile: Zone,
  currentUsedPile: Zone,
  rng: () => number,
): SkipBoValidator {
  return (session, playerId, action) => {
    const { publicState, privateStates } = session

    const isMyTurn = currentPlayer(publicState.turn) === playerId
    const myState = privateStates[playerId]
    if (!isMyTurn || !myState) {
      return { ok: false, reason: 'not your turn' }
    }
    if (publicState.roundOver) {
      return { ok: false, reason: 'round is over' }
    }

    if (action.type === 'PLAY_STOCK') {
      if (cardCount(myState.stock) === 0) return { ok: false, reason: 'stock is empty' }
      const card = topCard(myState.stock)!
      const target = chooseBuildPile(card, publicState.buildPiles)
      if (target === -1) return { ok: false, reason: 'not a legal play right now' }
      const { zone: newStock } = removeCardsById(myState.stock, [card.id])
      const { buildPiles, usedPile: newUsed } = playCardOntoPile(card, target, publicState.buildPiles, currentUsedPile)
      const newStockCounts = { ...publicState.stockCounts, [playerId]: cardCount(newStock) }
      const newPrivateStates = { ...privateStates, [playerId]: { ...myState, stock: newStock } }
      // Win check — the only source that can empty a stockpile: the instant it hits 0 the game
      // is over, even mid-turn. Return immediately: no turn advance, no discard step.
      if (cardCount(newStock) === 0) {
        return {
          ok: true,
          drawPile: currentDrawPile,
          usedPile: newUsed,
          publicState: {
            ...publicState,
            buildPiles,
            usedCount: cardCount(newUsed),
            stockCounts: newStockCounts,
            roundOver: true,
            winnerId: playerId,
          },
          privateStates: newPrivateStates,
        }
      }
      return {
        ok: true,
        drawPile: currentDrawPile,
        usedPile: newUsed,
        publicState: { ...publicState, buildPiles, usedCount: cardCount(newUsed), stockCounts: newStockCounts },
        privateStates: newPrivateStates,
      }
    }

    if (action.type === 'PLAY_HAND') {
      const card = myState.hand.cards.find((c) => c.id === action.cardId)
      if (!card) return { ok: false, reason: 'card not in hand' }
      const target = chooseBuildPile(card, publicState.buildPiles)
      if (target === -1) return { ok: false, reason: 'not a legal play right now' }
      const { zone: newHand } = removeCardsById(myState.hand, [action.cardId])
      const { buildPiles, usedPile: newUsed } = playCardOntoPile(card, target, publicState.buildPiles, currentUsedPile)
      return {
        ok: true,
        drawPile: currentDrawPile,
        usedPile: newUsed,
        publicState: {
          ...publicState,
          buildPiles,
          usedCount: cardCount(newUsed),
          handCounts: { ...publicState.handCounts, [playerId]: cardCount(newHand) },
        },
        privateStates: { ...privateStates, [playerId]: { ...myState, hand: newHand } },
      }
    }

    if (action.type === 'PLAY_DISCARD') {
      if (!Number.isInteger(action.pileIndex) || action.pileIndex < 0 || action.pileIndex > 3) {
        return { ok: false, reason: 'invalid pile index' }
      }
      const pile = myState.discards[action.pileIndex]
      if (cardCount(pile) === 0) return { ok: false, reason: 'that discard pile is empty' }
      const card = topCard(pile)!
      const target = chooseBuildPile(card, publicState.buildPiles)
      if (target === -1) return { ok: false, reason: 'not a legal play right now' }
      const { zone: newPile } = removeCardsById(pile, [card.id])
      const newDiscards = myState.discards.map((p, i) => (i === action.pileIndex ? newPile : p))
      const { buildPiles, usedPile: newUsed } = playCardOntoPile(card, target, publicState.buildPiles, currentUsedPile)
      return {
        ok: true,
        drawPile: currentDrawPile,
        usedPile: newUsed,
        publicState: {
          ...publicState,
          buildPiles,
          usedCount: cardCount(newUsed),
          discardTops: { ...publicState.discardTops, [playerId]: newDiscards.map((p) => topCard(p) ?? null) },
        },
        privateStates: { ...privateStates, [playerId]: { ...myState, discards: newDiscards } },
      }
    }

    if (action.type === 'DISCARD') {
      const card = myState.hand.cards.find((c) => c.id === action.cardId)
      if (!card) return { ok: false, reason: 'card not in hand' }
      // Emptiest of the player's 4 discard piles, ties -> lowest index (loop starts at 0 and
      // only replaces on a strictly-smaller pile, so the lowest index wins ties).
      let emptiestIndex = 0
      for (let i = 1; i < myState.discards.length; i++) {
        if (cardCount(myState.discards[i]) < cardCount(myState.discards[emptiestIndex])) {
          emptiestIndex = i
        }
      }
      const { from: newHand, to: newDiscardPile } = moveCards(myState.hand, myState.discards[emptiestIndex], [action.cardId])
      const newDiscards = myState.discards.map((pile, i) => (i === emptiestIndex ? newDiscardPile : pile))
      const ended = endTurnAndDrawToFive(publicState, privateStates, currentDrawPile, currentUsedPile, rng)
      return {
        ok: true,
        drawPile: ended.drawPile,
        usedPile: ended.usedPile,
        publicState: {
          ...ended.publicState,
          handCounts: { ...ended.publicState.handCounts, [playerId]: cardCount(newHand) },
          discardTops: { ...ended.publicState.discardTops, [playerId]: newDiscards.map((pile) => topCard(pile) ?? null) },
        },
        privateStates: {
          ...ended.privateStates,
          [playerId]: { ...myState, hand: newHand, discards: newDiscards },
        },
      }
    }

    if (action.type === 'PASS') {
      if (cardCount(myState.hand) !== 0) return { ok: false, reason: 'hand is not empty' }
      const ended = endTurnAndDrawToFive(publicState, privateStates, currentDrawPile, currentUsedPile, rng)
      return {
        ok: true,
        drawPile: ended.drawPile,
        usedPile: ended.usedPile,
        publicState: ended.publicState,
        privateStates: ended.privateStates,
      }
    }

    return { ok: false, reason: 'unknown action' }
  }
}

export function applySkipBoAction(
  game: SkipBoSession,
  playerId: string,
  action: SkipBoAction,
): { game: SkipBoSession; outcome: ActionOutcome<SkipBoPublicState, SkipBoPrivateState> } {
  const validate = makeValidator(game.drawPile, game.usedPile, game.rng)
  const { session, outcome } = applyAction(game.session, playerId, action, validate)
  // applyAction types its result as the engine's shared ActionOutcome, but the validator above
  // returned a SkipBoOutcome carrying the updated host-only zones. Read them straight off the
  // successful outcome; on a failed action the original zones are untouched.
  const rich = outcome as SkipBoOutcome
  const drawPile = outcome.ok && rich.drawPile !== undefined ? rich.drawPile : game.drawPile
  const usedPile = outcome.ok && rich.usedPile !== undefined ? rich.usedPile : game.usedPile
  return { game: { session, drawPile, usedPile, rng: game.rng }, outcome }
}

export function runSkipBoBotTurn(
  game: SkipBoSession,
  playerId: string,
  strategy: BotStrategy<SkipBoPublicState, SkipBoPrivateState, SkipBoAction>,
): { game: SkipBoSession; outcome: ActionOutcome<SkipBoPublicState, SkipBoPrivateState> } {
  const validate = makeValidator(game.drawPile, game.usedPile, game.rng)
  const { session, outcome } = runBotTurn(game.session, playerId, strategy, validate)
  // Same as applySkipBoAction: the validator's outcome carries the host-only zones, so read them
  // directly instead of threading them through mutable closures.
  const rich = outcome as SkipBoOutcome
  const drawPile = outcome.ok && rich.drawPile !== undefined ? rich.drawPile : game.drawPile
  const usedPile = outcome.ok && rich.usedPile !== undefined ? rich.usedPile : game.usedPile
  return { game: { session, drawPile, usedPile, rng: game.rng }, outcome }
}
