import { useState, useEffect, useMemo, useCallback } from 'react'
import type { Card, Rank, Suit } from '../card-engine/cards'
import type { RummyPublicState } from '../card-games/rummy/state'
import { currentPlayer } from '../card-engine/turn-engine'
import { classifyMeld } from '../card-games/rummy/melds'
import { deadwood } from '../card-games/rummy/scoring'
import { rankValue } from '../card-games/rummy/rank'
import { PlayingCard, CardBack, suitGlyph, suitColor } from '../components/PlayingCard'
import './RummyTable.css'

// ---- Props ----

export interface RummyTableProps {
  code: string
  localPlayerId: string
  localName: string
  opponentName: string
  opponentColor: string
  opponentHandCount: number
  connection: 'connected' | 'reconnecting'
  publicState: RummyPublicState
  hand: Card[]
  onDrawStock: () => void
  onDrawDiscard: (index: number) => void
  onLayDownMeld: (cardIds: string[]) => void
  onDiscard: (cardId: string) => void
  onOpenRules: () => void
  onLeave: () => void
}

// ---- Local helpers ----

const SUIT_ORDER: Record<Suit, number> = {
  spades: 0, hearts: 1, diamonds: 2, clubs: 3,
  joker: 4,
}

type StatusLine =
  | { pre: string; card: { rank: string; suit: Exclude<Suit, 'joker'> } | null; post: string }

function getReachedCard(pile: Card[], index: number): { rank: string; suit: Exclude<Suit, 'joker'> } {
  const c = pile[index]
  return { rank: c.rank, suit: c.suit as Exclude<Suit, 'joker'> }
}

function computeStatus(
  publicState: RummyPublicState,
  isMyTurn: boolean,
  opponentName: string,
  localPlayerId: string,
  hoverIndex: number | null,
  hand: Card[],
): StatusLine {
  // Round over
  if (publicState.roundOver) {
    const winnerName = publicState.roundWinnerId === localPlayerId ? 'You' : opponentName
    return { pre: `${winnerName} went out!`, card: null, post: '' }
  }

  // Not my turn
  if (!isMyTurn) {
    return { pre: `${opponentName}'s turn`, card: null, post: '' }
  }

  // My turn — draw phase
  if (publicState.turn.phase === 'draw') {
    // After reaching in — obligated card is set (this fires on the next render after draw)
    if (publicState.obligatedCardId) {
      const card = hand.find((c) => c.id === publicState.obligatedCardId)
      if (card) {
        return {
          pre: 'Lay down the ',
          card: { rank: card.rank, suit: card.suit as Exclude<Suit, 'joker'> },
          post: ' \u2014 that card has to be used.',
        }
      }
    }

    // Hovering a discard card
    if (hoverIndex !== null && publicState.discardPile.cards.length > 0) {
      const pile = publicState.discardPile.cards
      const n = pile.length - hoverIndex
      const reached = getReachedCard(pile, hoverIndex)
      if (n === 1) {
        return { pre: 'Take the ', card: reached, post: '.' }
      }
      return {
        pre: `Take ${n} cards \u2014 `,
        card: reached,
        post: ` and the ${n - 1} on top.`,
      }
    }

    // Idle — reach-in prompt
    return { pre: 'Reach in anywhere \u2014 you take that card and everything above it.', card: null, post: '' }
  }

  // My turn — discard phase
  if (publicState.obligatedCardId) {
    const card = hand.find((c) => c.id === publicState.obligatedCardId)
    if (card) {
      return {
        pre: 'Lay down the ',
        card: { rank: card.rank, suit: card.suit as Exclude<Suit, 'joker'> },
        post: ' \u2014 that card has to be used.',
      }
    }
  }

  return { pre: 'Select a card to discard.', card: null, post: '' }
}

function sortHand(cards: Card[], sortBy: 'suit' | 'rank'): Card[] {
  const sorted = [...cards]
  if (sortBy === 'suit') {
    sorted.sort((a, b) => {
      const s = SUIT_ORDER[a.suit] - SUIT_ORDER[b.suit]
      if (s !== 0) return s
      return rankValue(a.rank) - rankValue(b.rank)
    })
  } else {
    sorted.sort((a, b) => {
      const r = rankValue(a.rank) - rankValue(b.rank)
      if (r !== 0) return r
      return SUIT_ORDER[a.suit] - SUIT_ORDER[b.suit]
    })
  }
  return sorted
}

function layDownHint(selectedIds: string[], hand: Card[], obligatedCardId: string | null): string {
  if (obligatedCardId && !selectedIds.includes(obligatedCardId)) {
    const card = hand.find((c) => c.id === obligatedCardId)
    if (card) {
      return `Lay down the ${card.rank}${suitGlyph(card.suit as Exclude<Suit, 'joker'>)} you reached for`
    }
  }
  if (selectedIds.length < 3) {
    return 'Select 3+ cards that form a set or run'
  }
  const cards = selectedIds.map((id) => hand.find((c) => c.id === id)!).filter(Boolean)
  if (!classifyMeld(cards).valid) {
    return "Those don't form a set or run"
  }
  return ''
}

function discardHint(
  selectedIds: string[],
  isMyTurn: boolean,
  phase: string,
  obligatedCardId: string | null,
  hand: Card[],
): string {
  if (!isMyTurn) return "Not your turn"
  if (phase !== 'discard') return 'Draw a card first'
  if (obligatedCardId) {
    const card = hand.find((c) => c.id === obligatedCardId)
    if (card) {
      return `Lay down the ${card.rank}${suitGlyph(card.suit as Exclude<Suit, 'joker'>)} you reached for`
    }
  }
  if (selectedIds.length === 0) return 'Select exactly one card'
  if (selectedIds.length > 1) return 'Select exactly one card'
  return ''
}

function layDownEnabled(selectedIds: string[], hand: Card[]): boolean {
  if (selectedIds.length < 3) return false
  const cards = selectedIds.map((id) => hand.find((c) => c.id === id)!).filter(Boolean)
  if (cards.length !== selectedIds.length) return false
  return classifyMeld(cards).valid
}

function discardEnabled(
  selectedIds: string[],
  isMyTurn: boolean,
  phase: string,
  obligatedCardId: string | null,
): boolean {
  return (
    selectedIds.length === 1 &&
    phase === 'discard' &&
    isMyTurn &&
    !obligatedCardId
  )
}

// ---- Meld cluster sub-component ----

function MeldCluster({ cards, ownerColor, ownerShadow }: {
  cards: Card[]
  ownerColor?: string
  ownerShadow?: string
}) {
  return (
    <div className="rummy-meld-cluster">
      {cards.map((card, i) => (
        <PlayingCard
          key={card.id}
          rank={card.rank as Exclude<Rank, 'JOKER'>}
          suit={card.suit as Exclude<Suit, 'joker'>}
          size="meld"
          ownerColor={ownerColor}
          ownerShadow={ownerShadow}
          style={{ marginLeft: i === 0 ? 0 : -8 }}
        />
      ))}
    </div>
  )
}

// ---- Status display sub-component ----

function StatusDisplay({ status }: { status: StatusLine }) {
  return (
    <div className="rummy-status">
      {status.pre}
      {status.card && (
        <span style={{ color: suitColor(status.card.suit) }}>
          {status.card.rank}{suitGlyph(status.card.suit)}
        </span>
      )}
      {status.post}
    </div>
  )
}

// ---- RummyTable ----

export function RummyTable({
  code,
  localPlayerId,
  localName,
  opponentName,
  opponentColor,
  opponentHandCount,
  connection,
  publicState,
  hand,
  onDrawStock,
  onDrawDiscard,
  onLayDownMeld,
  onDiscard,
  onOpenRules,
  onLeave,
}: RummyTableProps) {
  // ---- Derived ----
  void localName // preserved in props for M4b wiring; unused in this presentational milestone
  const opponentId = publicState.turn.playerOrder.find((id) => id !== localPlayerId)!
  const isMyTurn = currentPlayer(publicState.turn) === localPlayerId
  const canAct = isMyTurn && !publicState.roundOver
  const theirMelds = publicState.melds[opponentId] ?? []
  const myMelds = publicState.melds[localPlayerId] ?? []
  const myDeadwood = deadwood(hand)

  // ---- Local state ----
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [hoverIndex, setHoverIndex] = useState<number | null>(null)
  const [sortBy, setSortBy] = useState<'suit' | 'rank'>('suit')

  // ---- Effects ----
  // Clear selectedIds when hand changes in a way that invalidates the selection
  useEffect(() => {
    setSelectedIds((prev) => prev.filter((id) => hand.some((c) => c.id === id)))
  }, [hand])

  // Auto-select the obligated card after a reach-in draw
  useEffect(() => {
    const obligId = publicState.obligatedCardId
    if (obligId && !selectedIds.includes(obligId)) {
      setSelectedIds((prev) => [...prev, obligId])
    }
  }, [publicState.obligatedCardId])

  // ---- Computed ----
  const sortedHand = useMemo(() => sortHand(hand, sortBy), [hand, sortBy])

  const status = useMemo(
    () => computeStatus(publicState, isMyTurn, opponentName, localPlayerId, hoverIndex, hand),
    [publicState, isMyTurn, opponentName, localPlayerId, hoverIndex, hand],
  )

  const showRoundBanner = publicState.roundOver && !publicState.matchWinnerId && publicState.roundWinnerId

  const canDrawStock = canAct && publicState.turn.phase === 'draw' && publicState.stockCount > 0
  const canReachIn = canAct && publicState.turn.phase === 'draw'

  const lEnabled = layDownEnabled(selectedIds, hand)
  const dEnabled = discardEnabled(selectedIds, isMyTurn, publicState.turn.phase, publicState.obligatedCardId)
  const lHint = lEnabled ? '' : layDownHint(selectedIds, hand, publicState.obligatedCardId)
  const dHint = dEnabled ? '' : discardHint(selectedIds, isMyTurn, publicState.turn.phase, publicState.obligatedCardId, hand)

  // ---- Handlers ----
  const handleCardClick = useCallback(
    (cardId: string) => {
      if (!canAct) return
      setSelectedIds((prev) =>
        prev.includes(cardId) ? prev.filter((id) => id !== cardId) : [...prev, cardId],
      )
    },
    [canAct],
  )

  const handleLayDown = useCallback(() => {
    onLayDownMeld(selectedIds)
    setSelectedIds([])
  }, [onLayDownMeld, selectedIds])

  const handleDiscard = useCallback(() => {
    onDiscard(selectedIds[0])
    setSelectedIds([])
  }, [onDiscard, selectedIds])

  // ---- Render ----
  const pile = publicState.discardPile.cards
  const fanCount = Math.min(opponentHandCount, 14)

  return (
    <div className="rummy-table">
      {/* Header */}
      <div className="rummy-header">
        <div className="rummy-header-left">
          <span className="rummy-brand">Pips</span>
          <span className="rummy-game-label">Rummy</span>
          <span className="rummy-peer-strip">
            <span
              className="rummy-peer-dot"
              style={{ background: connection === 'connected' ? 'var(--green)' : 'var(--amber)' }}
            />
            <span className="rummy-peer-label">peer to peer with {opponentName}</span>
          </span>
        </div>
        <div className="rummy-header-actions">
          <button type="button" className="btn pill-small" onClick={onOpenRules}>Rules</button>
          <button type="button" className="btn btn-ghost" onClick={onLeave}>Leave</button>
        </div>
      </div>

      {/* Code chip */}
      <div style={{ marginBottom: 'clamp(16px, 2.4vw, 26px)' }}>
        <span className="chip" style={{ background: 'var(--yellow)', color: 'var(--ink)' }}>Rummy · {code}</span>
      </div>

      {/* Main table card */}
      <div className="rummy-table-card">
        {/* Their side */}
        <div className="rummy-their-side">
          <div className="rummy-their-side-left">
            <div className="rummy-their-name" style={{ color: opponentColor }}>{opponentName}</div>
            <div className="rummy-their-count">{opponentHandCount} cards · hidden</div>
            {fanCount > 0 && (
              <div className="rummy-their-fan">
                {Array.from({ length: fanCount }, (_, i) => (
                  <CardBack
                    key={i}
                    size="fan"
                    style={{ marginLeft: i === 0 ? 0 : -15 }}
                  />
                ))}
              </div>
            )}
          </div>
          <div className="rummy-their-melds">
            {theirMelds.length > 0 ? (
              theirMelds.map((meld) => (
                <MeldCluster
                  key={meld.id}
                  cards={meld.cards}
                  ownerColor={opponentColor}
                  ownerShadow="var(--grey-border-3)"
                />
              ))
            ) : (
              <span className="rummy-melds-empty">{opponentName} has laid down nothing yet</span>
            )}
          </div>
        </div>

        {/* Centre band */}
        <div className="rummy-centre">
          {/* Round-over banner */}
          {showRoundBanner && (
            <div className="rummy-round-banner">
              {publicState.roundWinnerId === localPlayerId ? 'You' : opponentName}
              {' won this round — '}
              {publicState.scores[publicState.roundWinnerId!] ?? 0}
              {' points. Round '}
              {publicState.roundNumber + 1}
              {' starts automatically.'}
            </div>
          )}

          <div className="rummy-centre-left">
            {/* Stock */}
            <div className="rummy-stock-group">
              <CardBack
                size="stock"
                canDraw={canDrawStock}
                onClick={canDrawStock ? onDrawStock : undefined}
              />
              <div className="rummy-stock-caption">stock {publicState.stockCount}</div>
            </div>

            {/* Discard */}
            <div className="rummy-discard-group">
              <div className="rummy-discard-strip">
                {pile.length > 0 ? (
                  pile.map((card, i) => {
                    const isReachHover = hoverIndex !== null && i >= hoverIndex
                    const canHover = canReachIn
                    return (
                      <span
                        key={card.id}
                        className="rummy-discard-card-wrapper"
                        style={{
                          zIndex: i,
                          marginLeft: i === 0 ? 0 : -30,
                          paddingTop: 14,
                        }}
                        onMouseEnter={
                          canHover ? () => setHoverIndex(i) : undefined
                        }
                        onMouseLeave={
                          canHover
                            ? () => setHoverIndex((prev) => (prev === i ? null : prev))
                            : undefined
                        }
                      >
                        <PlayingCard
                          rank={card.rank as Exclude<Rank, 'JOKER'>}
                          suit={card.suit as Exclude<Suit, 'joker'>}
                          size="discard"
                          className={isReachHover ? 'playing-card--reach-hover' : undefined}
                          onClick={canHover ? () => onDrawDiscard(i) : undefined}
                        />
                      </span>
                    )
                  })
                ) : (
                  <span className="rummy-discard-empty">Discard pile empty</span>
                )}
              </div>
            </div>
          </div>

          {/* Right group: turn chip + status */}
          <div className="rummy-centre-right">
            <span
              className="rummy-turn-chip"
              style={{ background: isMyTurn ? 'var(--green-text)' : opponentColor }}
            >
              {isMyTurn ? 'Your turn' : `${opponentName}'s turn`}
            </span>
            <StatusDisplay status={status} />
          </div>
        </div>

        {/* Your side */}
        <div className="rummy-your-side">
          <div className="rummy-your-melds">
            {myMelds.length > 0 ? (
              myMelds.map((meld) => (
                <MeldCluster key={meld.id} cards={meld.cards} />
              ))
            ) : (
              <span className="rummy-melds-empty">You have laid nothing down yet</span>
            )}
          </div>

          <div className="rummy-hand-section">
            {/* Hand header */}
            <div className="rummy-hand-header">
              <div className="rummy-hand-header-left">
                <span className="rummy-hand-label">Your hand</span>
                <span className="rummy-hand-stats">
                  {hand.length} cards · deadwood {myDeadwood}
                </span>
              </div>
              <div className="rummy-sort-toggle">
                <button
                  type="button"
                  className={`rummy-sort-btn ${sortBy === 'suit' ? 'rummy-sort-btn--active' : ''}`}
                  onClick={() => setSortBy('suit')}
                >
                  suit
                </button>
                <button
                  type="button"
                  className={`rummy-sort-btn ${sortBy === 'rank' ? 'rummy-sort-btn--active' : ''}`}
                  onClick={() => setSortBy('rank')}
                >
                  rank
                </button>
              </div>
            </div>

            {/* Hand cards */}
            <div className="rummy-hand-fan">
              {sortedHand.map((card, i) => (
                <PlayingCard
                  key={card.id}
                  rank={card.rank as Exclude<Rank, 'JOKER'>}
                  suit={card.suit as Exclude<Suit, 'joker'>}
                  size="hand"
                  selected={selectedIds.includes(card.id)}
                  onClick={canAct ? () => handleCardClick(card.id) : undefined}
                  style={{ marginLeft: i === 0 ? 0 : -26 }}
                />
              ))}
            </div>

            {/* Actions row */}
            {!publicState.roundOver && (
              <div className="rummy-actions">
                <button
                  type="button"
                  className="btn rummy-action-btn"
                  disabled={!lEnabled}
                  onClick={handleLayDown}
                >
                  Lay down {selectedIds.length}
                </button>
                <button
                  type="button"
                  className="btn btn-coral rummy-action-btn"
                  disabled={!dEnabled}
                  onClick={handleDiscard}
                >
                  Discard
                </button>
                <span className="rummy-action-hint">{lHint || dHint}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Footnote */}
      <p className="rummy-footnote">Your hand never leaves this device — only the play does.</p>
    </div>
  )
}
