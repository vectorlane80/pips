import type { BotStrategy } from '../../card-engine/bot.ts'
import type { RummyPublicState, RummyPrivateState, RummyAction } from './state.ts'
import { classifyMeld, hasMeldIncluding } from './melds.ts'
import { rankValue, deadwoodValue } from './rank.ts'
import type { Card } from '../../card-engine/cards.ts'

/**
 * Finds any 3+ card subset of `cards` that forms a valid meld (set or run),
 * optionally constrained to include a specific card by id.
 *
 * Returns the subset's ids in their order within the meld, or null if none exists.
 * When multiple melds are found, prefers the largest (most cards).
 */
export function findMeld(cards: Card[], requiredId?: string): string[] | null {
  if (requiredId !== undefined) {
    const required = cards.find((c) => c.id === requiredId)
    if (!required) return null
    const rest = cards.filter((c) => c.id !== requiredId)
    const n = rest.length
    let best: string[] | null = null
    for (let mask = 1; mask < 1 << n; mask++) {
      const subset: Card[] = [required]
      for (let i = 0; i < n; i++) {
        if (mask & (1 << i)) subset.push(rest[i])
      }
      if (subset.length >= 3 && classifyMeld(subset).valid) {
        const ids = subset.map((c) => c.id)
        if (!best || ids.length > best.length) {
          best = ids
        }
      }
    }
    return best
  }

  // Unconstrained: enumerate all subsets of size 3+
  const n = cards.length
  let best: string[] | null = null
  for (let mask = 1; mask < 1 << n; mask++) {
    const subset: Card[] = []
    for (let i = 0; i < n; i++) {
      if (mask & (1 << i)) subset.push(cards[i])
    }
    if (subset.length >= 3 && classifyMeld(subset).valid) {
      const ids = subset.map((c) => c.id)
      if (!best || ids.length > best.length) {
        best = ids
      }
    }
  }
  return best
}

/**
 * Returns every valid 3+ card subset of `cards` that forms a meld (set or run).
 * Used by the lookahead search in bestFirstMeld.
 */
function findAllValidMelds(cards: Card[]): Card[][] {
  const results: Card[][] = []
  const n = cards.length
  for (let mask = 1; mask < 1 << n; mask++) {
    const subset: Card[] = []
    for (let i = 0; i < n; i++) {
      if (mask & (1 << i)) subset.push(cards[i])
    }
    if (subset.length >= 3 && classifyMeld(subset).valid) {
      results.push(subset)
    }
  }
  return results
}

/**
 * For the unconstrained discard-phase meld choice: picks the meld that leads to
 * melding the MOST total cards this turn via a recursive lookahead, rather than
 * greedily picking the single largest meld.
 *
 * Falls back to the old greedy-largest behaviour (findMeld) when the hand is
 * unrealistically large (should never happen under normal deal/draw rules), to
 * guard against pathological blowup.
 */
function bestFirstMeld(cards: Card[]): string[] | null {
  if (cards.length > 14) return findMeld(cards)

  const allMelds = findAllValidMelds(cards)
  if (allMelds.length === 0) return null

  const memo = new Map<string, number>()

  function totalMeldable(remaining: Card[]): number {
    const key = remaining.map((c) => c.id).sort().join(',')
    if (memo.has(key)) return memo.get(key)!
    const melds = findAllValidMelds(remaining)
    let best = 0
    for (const meld of melds) {
      const meldIds = new Set(meld.map((c) => c.id))
      const rest = remaining.filter((c) => !meldIds.has(c.id))
      best = Math.max(best, meld.length + totalMeldable(rest))
    }
    memo.set(key, best)
    return best
  }

  let bestMeld: Card[] | null = null
  let bestScore = -1
  for (const meld of allMelds) {
    const meldIds = new Set(meld.map((c) => c.id))
    const rest = cards.filter((c) => !meldIds.has(c.id))
    const score = meld.length + totalMeldable(rest)
    if (score > bestScore) {
      bestScore = score
      bestMeld = meld
    }
  }
  return bestMeld ? bestMeld.map((c) => c.id) : null
}

/**
 * Connectivity score for a card within a hand — how "useful" the card is for
 * building melds. Higher = keep, lower = discard candidate.
 *
 * Score = count of other hand cards sharing its rank (set potential)
 *       + count of other hand cards of the same suit within rank-distance 2
 *         (run potential).
 */
function connectivityScore(card: Card, hand: Card[]): number {
  const cardVal = rankValue(card.rank)
  let score = 0
  for (const other of hand) {
    if (other.id === card.id) continue
    if (other.rank === card.rank) {
      score++
    } else if (other.suit === card.suit && Math.abs(rankValue(other.rank) - cardVal) <= 2) {
      score++
    }
  }
  return score
}

/**
 * Pick the least-useful card to discard: lowest connectivity score.
 * Break ties by highest deadwood value (shed expensive isolated cards first).
 */
function selectDiscard(hand: Card[]): string {
  let bestCard = hand[0]
  let bestScore = connectivityScore(bestCard, hand)
  let bestDeadwood = deadwoodValue(bestCard.rank)

  for (let i = 1; i < hand.length; i++) {
    const card = hand[i]
    const score = connectivityScore(card, hand)
    const dw = deadwoodValue(card.rank)
    if (score < bestScore || (score === bestScore && dw > bestDeadwood)) {
      bestCard = card
      bestScore = score
      bestDeadwood = dw
    }
  }
  return bestCard.id
}

export const rummyBotStrategy: BotStrategy<
  RummyPublicState,
  RummyPrivateState,
  RummyAction
> = (publicState, privateState, _playerId) => {
  // Guard: if the round is already over, the only sensible action is to
  // start the next round.  Defensive — a caller that doesn't check roundOver
  // before calling us would otherwise crash on the empty hand below.
  if (publicState.roundOver) {
    return { type: 'START_NEXT_ROUND' }
  }

  const phase = publicState.turn.phase
  const hand = privateState.hand.cards

  // ── Draw phase ──────────────────────────────────────────────
  if (phase === 'draw') {
    const pile = publicState.discardPile.cards
    if (pile.length > 0) {
      const topCard = pile[pile.length - 1]
      if (hasMeldIncluding([...hand, topCard], topCard.id)) {
        return { type: 'DRAW_FROM_DISCARD', index: pile.length - 1 }
      }
    }
    // Stock is empty and the discard pile has at least one card that isn't
    // immediately meldable — but we must draw something.  Take just the top
    // card (a single-card take never sets an obligation and is always legal
    // when the pile is non-empty).  Without this fallback the bot would
    // propose DRAW_FROM_STOCK forever (rules.ts rejects it when stockCount===0
    // and the pile has exactly 1 card), creating a genuine livelock.
    if (publicState.stockCount === 0 && pile.length >= 1) {
      return { type: 'DRAW_FROM_DISCARD', index: pile.length - 1 }
    }
    return { type: 'DRAW_FROM_STOCK' }
  }

  // ── Discard phase ───────────────────────────────────────────
  const obligated = publicState.obligatedCardId

  // Case 2: obligation — must meld with that card
  if (obligated) {
    const meld = findMeld(hand, obligated)
    if (meld) {
      return { type: 'LAY_DOWN_MELD', cardIds: meld }
    }
    // Shouldn't happen (validator only sets obligation when meld exists),
    // but if it does, fall through to the general meld search below.
  }

  // Case 3: any meld available → lay one down (use lookahead to pick the
  // meld that leads to melding the most total cards this turn)
  const meld = bestFirstMeld(hand)
  if (meld) {
    return { type: 'LAY_DOWN_MELD', cardIds: meld }
  }

  // Case 4: no meld → discard least-useful card
  return { type: 'DISCARD_CARD', cardId: selectDiscard(hand) }
}
