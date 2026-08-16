import type { BotStrategy } from '../../engine/bot.ts'
import type { RummyPublicState, RummyPrivateState, RummyAction } from './state.ts'
import { fullMeldCards } from './state.ts'
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
> = (publicState, privateState, playerId) => {
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
    // Stock is empty and the discard pile has exactly one card that isn't
    // immediately meldable — that lone card is the only thing left to draw,
    // so take it (a single-card take never sets an obligation and is always
    // legal). rules.ts rejects DRAW_FROM_STOCK in precisely this situation
    // (stockCount === 0 and the pile has exactly 1 card); without this
    // fallback the bot would propose it forever, a genuine livelock.
    //
    // When the discard pile has 2+ cards instead, DRAW_FROM_STOCK is still
    // legal even with an empty stock — it recycles the pile (keeping the top
    // card in place) into a fresh shuffled stock and draws from that. Forcing
    // a discard-pile take here too (the bug this comment used to describe as
    // intentional) meant the bot could never trigger a recycle: it would keep
    // taking-then-discarding the same unwanted top card forever once stock
    // ran dry, a real stalemate a human player hit in practice.
    if (publicState.stockCount === 0 && pile.length === 1) {
      return { type: 'DRAW_FROM_DISCARD', index: pile.length - 1 }
    }
    return { type: 'DRAW_FROM_STOCK' }
  }

  // ── Discard phase ───────────────────────────────────────────
  const obligated = publicState.obligatedCardId

  // Case 2: obligation — must use that card in a meld action
  if (obligated) {
    const meld = findMeld(hand, obligated)
    if (meld) {
      return { type: 'LAY_DOWN_MELD', cardIds: meld }
    }
    // From-hand meld failed: try laying the obligated card off onto an existing meld
    // group instead — the validator accepts either path (see obligationSatisfiable).
    // LAY_OFF requires an own meld already down, same as Case 3b.
    const obligCard = hand.find((c) => c.id === obligated)
    if (obligCard && (publicState.melds[playerId] ?? []).length > 0) {
      for (const [ownerId, zones] of Object.entries(publicState.melds)) {
        for (let meldIndex = 0; meldIndex < zones.length; meldIndex++) {
          const group = fullMeldCards(publicState.melds, publicState.layoffs, ownerId, meldIndex)
          if (classifyMeld([...group, obligCard]).valid) {
            return { type: 'LAY_OFF', targetPlayerId: ownerId, meldIndex, cardIds: [obligCard.id] }
          }
        }
      }
    }
    // Still unresolved — fall through to the general search below.
  }

  // Case 3: any meld available → lay one down (use lookahead to pick the
  // meld that leads to melding the most total cards this turn)
  const meld = bestFirstMeld(hand)
  if (meld) {
    return { type: 'LAY_DOWN_MELD', cardIds: meld }
  }

  // Case 3b: lay off any single hand card that legally extends an existing meld group —
  // own or opponent's. One card per action; runRummyBotTurn calls us again, so multi-card
  // extensions happen incrementally (any valid multi-card run/set extension can be ordered
  // as a sequence of individually-valid single cards). Always beneficial: the card scores
  // to us and stops counting as deadwood.
  if ((publicState.melds[playerId] ?? []).length > 0) {
    for (const [ownerId, zones] of Object.entries(publicState.melds)) {
      for (let meldIndex = 0; meldIndex < zones.length; meldIndex++) {
        const group = fullMeldCards(publicState.melds, publicState.layoffs, ownerId, meldIndex)
        for (const card of hand) {
          if (classifyMeld([...group, card]).valid) {
            return { type: 'LAY_OFF', targetPlayerId: ownerId, meldIndex, cardIds: [card.id] }
          }
        }
      }
    }
  }

  // Case 4: no meld → discard least-useful card
  return { type: 'DISCARD_CARD', cardId: selectDiscard(hand) }
}
