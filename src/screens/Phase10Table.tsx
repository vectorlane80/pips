import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import type { Card } from '../card-engine/cards'
import type { Phase10PublicState } from '../card-games/phase10/state'
import { fullGroupCards } from '../card-games/phase10/state'
import { currentPlayer } from '../engine/turn-engine'
import { classifyPhaseHand, isValidSet, isValidRun, isValidColorGroup, orderColorGroupForDisplay, orderRunForDisplay, type GroupType } from '../card-games/phase10/classify'
import { PHASES, type PhaseRequirement } from '../card-games/phase10/phases'
import { DealIntro } from '../components/DealIntro'
import { Phase10Card, Phase10CardBack, PHASE10_COLORS } from '../components/Phase10Card'
import { ScoreHeader } from '../components/ScoreHeader'
import { Wordmark } from '../components/Wordmark'
import { SoundToggle } from '../components/SoundToggle'
import { TurnSoundToggle } from '../components/TurnSoundToggle'
import { Phase10RulesOverlay } from './Phase10RulesOverlay'
import { useSound } from '../hooks/useSound'
import { useTurnStartSound } from '../hooks/useTurnStartSound'
import './Phase10Table.css'

// ---- Props ----

export interface Phase10TableProps {
  code: string
  localPlayerId: string
  localName: string
  opponentName: string
  opponentColor: string
  opponentHandCount: number
  connection: 'connected' | 'disconnected'
  notice?: string | null
  publicState: Phase10PublicState
  hand: Card[]
  onDrawStock: () => void
  onDrawDiscard: () => void          // top card only, no index — unlike Rummy
  onLayPhase: (cardIds: string[]) => void
  onHit: (targetPlayerId: string, groupIndex: number, cardIds: string[]) => void
  onDiscard: (cardId: string) => void
  onOpenRules: () => void
  onLeave: () => void
}

// ---- Local helpers ----

const COLOR_ORDER: Record<string, number> = { red: 0, blue: 1, green: 2, yellow: 3, special: 4 }

/** The local player's seat colour — violet, matching the ladder's "you" dot. */
const MY_COLOR = 'var(--violet)'

type StatusLine = {
  pre: string
  card: { rank: string; suit: string } | null
  post: string
}

function computeStatus(
  publicState: Phase10PublicState,
  isMyTurn: boolean,
  opponentName: string,
  localPlayerId: string,
  justDrawn: Card | null,
): StatusLine {
  // Round over
  if (publicState.roundOver) {
    if (publicState.roundWinnerId === null) {
      return { pre: 'Round blocked — no cards left to draw.', card: null, post: '' }
    }
    const winnerName = publicState.roundWinnerId === localPlayerId ? 'You' : opponentName
    return { pre: `${winnerName} went out!`, card: null, post: '' }
  }

  // Not my turn
  if (!isMyTurn) {
    return { pre: `${opponentName}'s turn`, card: null, post: '' }
  }

  // My turn — draw phase
  if (publicState.turn.phase === 'draw') {
    return { pre: 'Draw from the stock, or take the top of the discard.', card: null, post: '' }
  }

  // My turn — discard phase, just drew a card
  if (justDrawn) {
    return { pre: 'You drew the ', card: { rank: justDrawn.rank, suit: justDrawn.suit }, post: '.' }
  }

  return { pre: 'Select cards to lay your phase, hit, or discard.', card: null, post: '' }
}

// The round-over banner text. Shows for every ended round that isn't a match end —
// including the blocked round (roundWinnerId === null), which still needs its own copy.
function computeRoundBanner(
  publicState: Phase10PublicState,
  localPlayerId: string,
  localName: string,
  opponentName: string,
): string {
  if (publicState.roundWinnerId === null) {
    return 'Round blocked — no cards left to draw. Dealing a new round…'
  }
  const winnerName = publicState.roundWinnerId === localPlayerId ? 'You' : opponentName
  const opponentId = publicState.turn.playerOrder.find((id) => id !== localPlayerId)!
  return (
    `${winnerName} went out! ${localName}: ${publicState.scores[localPlayerId] ?? 0}` +
    ` pts · ${opponentName}: ${publicState.scores[opponentId] ?? 0} pts. ` +
    `Next round starts automatically.`
  )
}

// 'color' groups number cards by colour first, then rank — sets and colour groups read as
// contiguous blocks. 'rank' groups by rank first, then colour — runs (which ignore colour)
// read as contiguous blocks instead. Skip/Wild (suit 'special') always sort last either way.
function sortHandForDisplay(cards: Card[], sortBy: 'color' | 'rank'): Card[] {
  return [...cards].sort((a, b) => {
    const ca = COLOR_ORDER[a.suit] ?? 4
    const cb = COLOR_ORDER[b.suit] ?? 4
    const na = Number(a.rank)
    const nb = Number(b.rank)
    const aIsNumber = !Number.isNaN(na)
    const bIsNumber = !Number.isNaN(nb)
    const rankCmp = aIsNumber && bIsNumber ? na - nb : aIsNumber !== bIsNumber ? (aIsNumber ? -1 : 1) : 0
    if (sortBy === 'color') {
      if (ca !== cb) return ca - cb
      return rankCmp
    }
    if (rankCmp !== 0) return rankCmp
    return ca - cb
  })
}

// Within a laid group: sets read best sorted by colour, runs and colour groups by number.
function sortGroupForDisplay(cards: Card[], type: GroupType): Card[] {
  if (type === 'set') {
    return [...cards].sort((a, b) => (COLOR_ORDER[a.suit] ?? 4) - (COLOR_ORDER[b.suit] ?? 4))
  }
  if (type === 'run') return orderRunForDisplay(cards)
  return orderColorGroupForDisplay(cards)
}

function layPhaseEnabled(selectedIds: string[], hand: Card[], requirement: PhaseRequirement): boolean {
  const cards = selectedIds.map((id) => hand.find((c) => c.id === id)).filter((c): c is Card => c !== undefined)
  if (cards.length !== selectedIds.length) return false
  return classifyPhaseHand(cards, requirement).valid
}

function canHitGroup(groupCards: Card[], groupType: GroupType, selectedCards: Card[]): boolean {
  const combined = [...groupCards, ...selectedCards]
  return groupType === 'set' ? isValidSet(combined)
       : groupType === 'run' ? isValidRun(combined)
       : isValidColorGroup(combined)
}

function layPhaseHint(
  selectedIds: string[],
  hand: Card[],
  requirement: PhaseRequirement,
  isMyTurn: boolean,
  phase: string,
  hasLaid: boolean,
): string {
  if (!isMyTurn) return 'Not your turn'
  if (phase !== 'discard') return 'Draw a card first'
  if (hasLaid) return 'Phase already laid this hand'
  const total = requirement.parts.reduce((sum, p) => sum + p.count, 0)
  if (selectedIds.length === 0) return `Select ${total} cards that form your phase`
  // Laying a phase takes EXACTLY the required count — no more, no less. Extra matching
  // cards (e.g. a 4th card of a kind you're using for a set of 3) go on later via a hit,
  // once your phase is down, not into this selection. Tell the player the exact count
  // rather than a generic "doesn't complete" — that message reads as "your cards are
  // wrong" when the real issue is just "you selected the wrong number of cards."
  if (selectedIds.length !== total) return `Select exactly ${total} cards (you have ${selectedIds.length})`
  const cards = selectedIds.map((id) => hand.find((c) => c.id === id)).filter((c): c is Card => c !== undefined)
  if (cards.length !== selectedIds.length) return `Select exactly ${total} cards (you have ${selectedIds.length})`
  if (!classifyPhaseHand(cards, requirement).valid) return "Those don't complete your phase"
  return ''
}

function discardHint(selectedIds: string[], isMyTurn: boolean, phase: string): string {
  if (!isMyTurn) return 'Not your turn'
  if (phase !== 'discard') return 'Draw a card first'
  if (selectedIds.length === 0) return 'Select exactly one card'
  if (selectedIds.length > 1) return 'Select exactly one card'
  return ''
}

// ---- Group cluster sub-component ----

function GroupCluster({ cards, type, ownerColor, ownerShadow, caption, onHit }: {
  cards: Card[]
  type: GroupType
  ownerColor?: string
  ownerShadow?: string
  /** "Phase N" caption above the group, coloured with the owner's seat colour. */
  caption?: string
  /** Present iff the single selected card could validly be hit onto this group. */
  onHit?: () => void
}) {
  const sorted = sortGroupForDisplay(cards, type)
  return (
    <div className="p10-group-wrap">
      {caption && <div className="p10-group-caption" style={{ color: ownerColor }}>{caption}</div>}
      <div
        className={`p10-group${onHit ? ' p10-group--hittable' : ''}`}
        onClick={onHit}
        role={onHit ? 'button' : undefined}
        tabIndex={onHit ? 0 : undefined}
      >
        {sorted.map((card, i) => (
          <Phase10Card
            key={card.id}
            card={card}
            size="group"
            ownerColor={ownerColor}
            ownerShadow={ownerShadow}
            style={{ marginLeft: i === 0 ? 0 : -8 }}
          />
        ))}
      </div>
    </div>
  )
}

// ---- Phase ladder sub-component ----

function PhaseLadder({
  localPhaseIdx,
  opponentPhaseIdx,
  opponentColor,
}: {
  localPhaseIdx: number
  opponentPhaseIdx: number
  opponentColor: string
}) {
  const [hovered, setHovered] = useState<number | null>(null)
  return (
    <div className="p10-ladder">
      <div className="p10-ladder-chips">
        {PHASES.map((p, i) => {
          const fill = i < localPhaseIdx ? 'done' : i === localPhaseIdx ? 'current' : 'ahead'
          return (
            <div
              key={p.phase}
              className="p10-ladder-chip-wrap"
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered(null)}
            >
              <div
                className={`p10-ladder-chip p10-ladder-chip--${fill}${i === opponentPhaseIdx ? ' p10-ladder-chip--opponent-here' : ''}`}
                style={i === opponentPhaseIdx ? { boxShadow: `0 0 0 3px var(--surface), 0 0 0 6px ${opponentColor}` } : undefined}
              >
                {p.phase}
              </div>
              <div className="p10-ladder-dots">
                {i === localPhaseIdx && <span className="p10-ladder-dot" style={{ background: 'var(--violet)' }} />}
                {i === opponentPhaseIdx && <span className="p10-ladder-dot" style={{ background: opponentColor }} />}
              </div>
            </div>
          )
        })}
      </div>
      <div className="p10-ladder-caption">
        {hovered !== null ? `Phase ${PHASES[hovered].phase} — ${PHASES[hovered].label}` : '\u00a0'}
      </div>
    </div>
  )
}

// ---- Status display sub-component ----

function StatusDisplay({ status }: { status: StatusLine }) {
  return (
    <div className="p10-status">
      {status.pre}
      {status.card && (
        <span
          className="p10-status-card"
          style={{ color: PHASE10_COLORS[status.card.suit as 'red' | 'blue' | 'green' | 'yellow'] ?? 'var(--ink)' }}
        >
          {status.card.rank}
          {status.card.suit !== 'special' ? ` ${status.card.suit}` : ''}
        </span>
      )}
      {status.post}
    </div>
  )
}

// ---- Phase10Table ----

export function Phase10Table({
  code,
  localPlayerId,
  localName,
  opponentName,
  opponentColor,
  opponentHandCount,
  connection,
  notice,
  publicState,
  hand,
  onDrawStock,
  onDrawDiscard,
  onLayPhase,
  onHit,
  onDiscard,
  onOpenRules,
  onLeave,
}: Phase10TableProps) {
  void onOpenRules // rules overlay now managed as local state; prop kept for future wiring

  // ---- Derived ----
  const opponentId = publicState.turn.playerOrder.find((id) => id !== localPlayerId)!
  const isMyTurn = currentPlayer(publicState.turn) === localPlayerId
  const canAct = isMyTurn && !publicState.roundOver
  const myPhaseIdx = publicState.phaseIdx[localPlayerId] ?? 0
  const oppPhaseIdx = publicState.phaseIdx[opponentId] ?? 0
  const myRequirement = PHASES[myPhaseIdx]
  const hasLaid = publicState.hasLaidPhase[localPlayerId] ?? false

  const theirGroups = publicState.groups[opponentId] ?? []
  const myGroups = publicState.groups[localPlayerId] ?? []
  // Hits render on the HITTER's side: self-extensions merge into the owner's own clusters,
  // cross-hits appear as captioned mini-clusters on the hitter's side.
  const theirOwnHits = publicState.hits.filter((h) => h.playerId === opponentId && h.targetPlayerId === opponentId)
  const myOwnHits = publicState.hits.filter((h) => h.playerId === localPlayerId && h.targetPlayerId === localPlayerId)
  const myCrossHits = publicState.hits.filter((h) => h.playerId === localPlayerId && h.targetPlayerId === opponentId)
  const theirCrossHits = publicState.hits.filter((h) => h.playerId === opponentId && h.targetPlayerId === localPlayerId)

  // ---- Local state ----
  const { play, enabled, setEnabled, turnSoundEnabled, setTurnSoundEnabled, playTurnStart } = useSound()
  useTurnStartSound(isMyTurn, opponentId === 'bot' ? 1 : 2, playTurnStart)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [justDrawn, setJustDrawn] = useState<Card | null>(null)
  const [rulesOpen, setRulesOpen] = useState(false)
  const [sortBy, setSortBy] = useState<'color' | 'rank'>('color')
  const prevHandRef = useRef<Card[]>(hand)

  // Fresh-round detection: show the deal intro exactly once per distinct
  // roundNumber this component instance ever sees.
  const introShownForRoundRef = useRef<number | null>(null)
  const [showIntro, setShowIntro] = useState(false)

  // ---- Effects ----
  // Show the deal intro on mount and on every START_NEXT_ROUND transition;
  // never re-fires for the same round on an unrelated re-render.
  useEffect(() => {
    if (introShownForRoundRef.current !== publicState.roundNumber) {
      introShownForRoundRef.current = publicState.roundNumber
      setShowIntro(true)
    }
  }, [publicState.roundNumber])

  // Clear selectedIds when the hand changes in a way that invalidates the selection
  useEffect(() => {
    setSelectedIds((prev) => prev.filter((id) => hand.some((c) => c.id === id)))
  }, [hand])

  // Clear justDrawn on every turn boundary
  useEffect(() => {
    setJustDrawn(null)
  }, [publicState.turn.turnNumber])

  // Detect single-card draws for "you drew the X" feedback
  useEffect(() => {
    const prev = prevHandRef.current
    const diff = hand.length - prev.length
    if (diff === 1 && publicState.turn.phase === 'discard') {
      const newCard = hand.find((c) => !prev.some((pc) => pc.id === c.id))
      if (newCard) setJustDrawn(newCard)
    } else {
      setJustDrawn(null)
    }
    prevHandRef.current = hand
  }, [hand, publicState.turn.phase])

  // Sound effects — diff room state transitions, but only for my own actions
  // (never for the opponent's turn — otherwise a fast bot spams sound).
  const groupCount = Object.values(publicState.groups).reduce(
    (total, gs) => total + gs.reduce((n, g) => n + g.zone.cards.length, 0),
    0,
  )
  const stockCount = publicState.stockCount
  const discardLen = publicState.discardPile.cards.length
  const hitCount = publicState.hits.length
  const soundSigRef = useRef({
    stockCount, discardLen, groupCount, hitCount,
    roundOver: publicState.roundOver, matchWinnerId: publicState.matchWinnerId, wasMyTurn: isMyTurn,
  })
  const noticeSeenRef = useRef(!!notice)

  useEffect(() => {
    const p = soundSigRef.current
    if (p.wasMyTurn) {
      if (stockCount > p.stockCount) {
        play('shuffle')
      } else if (stockCount < p.stockCount) {
        play('card-draw')
      } else if (discardLen < p.discardLen) {
        play('card-draw')
      } else if (discardLen > p.discardLen) {
        play('card-play')
      } else if (groupCount > p.groupCount || hitCount > p.hitCount) {
        play('card-play')
      }
    }
    if (!p.roundOver && publicState.roundOver && publicState.roundWinnerId !== null) {
      play('round-win')
    }
    if (notice && !noticeSeenRef.current) {
      play('error')
      noticeSeenRef.current = true
    } else if (!notice) {
      noticeSeenRef.current = false
    }
    soundSigRef.current = {
      stockCount, discardLen, groupCount, hitCount,
      roundOver: publicState.roundOver, matchWinnerId: publicState.matchWinnerId, wasMyTurn: isMyTurn,
    }
  }, [stockCount, discardLen, groupCount, hitCount, publicState.roundOver, publicState.roundWinnerId, isMyTurn, notice, play])

  // ---- Computed ----
  const sortedHand = useMemo(() => {
    if (!justDrawn || !hand.some((c) => c.id === justDrawn.id)) {
      return sortHandForDisplay(hand, sortBy)
    }
    const rest = hand.filter((c) => c.id !== justDrawn.id)
    return [...sortHandForDisplay(rest, sortBy), justDrawn]
  }, [hand, justDrawn, sortBy])

  const selectedCards = useMemo(
    () => selectedIds.map((id) => hand.find((c) => c.id === id)).filter((c): c is Card => c !== undefined),
    [selectedIds, hand],
  )

  const status = useMemo(
    () => computeStatus(publicState, isMyTurn, opponentName, localPlayerId, justDrawn),
    [publicState, isMyTurn, opponentName, localPlayerId, justDrawn],
  )

  const showRoundBanner = publicState.roundOver && !publicState.matchWinnerId
  const roundBannerText = useMemo(
    () => computeRoundBanner(publicState, localPlayerId, localName, opponentName),
    [publicState, localPlayerId, localName, opponentName],
  )

  // DRAW_FROM_STOCK is always a legal attempt during the draw phase — the validator itself
  // handles an empty stock by recycling the discard pile or, if that's not possible either,
  // blocking the round. Gating this on stockCount > 0 would make the stock unclickable in
  // exactly the states the engine is designed to resolve.
  const canDrawStock = canAct && publicState.turn.phase === 'draw'
  const pile = publicState.discardPile.cards
  const discardTop = pile.length > 0 ? pile[pile.length - 1] : null
  // Top card only, and a Skip can never be taken off the discard pile.
  const canDrawDiscard = canAct && publicState.turn.phase === 'draw' && discardTop !== null && discardTop.meta?.kind !== 'skip'

  const canLayPhase = canAct && publicState.turn.phase === 'discard' && !hasLaid
  const lEnabled = canLayPhase && layPhaseEnabled(selectedIds, hand, myRequirement)
  const dEnabled = selectedIds.length === 1 && publicState.turn.phase === 'discard' && isMyTurn

  const lHint = lEnabled ? '' : layPhaseHint(selectedIds, hand, myRequirement, isMyTurn, publicState.turn.phase, hasLaid)
  const dHint = dEnabled ? '' : discardHint(selectedIds, isMyTurn, publicState.turn.phase)

  // True iff every currently selected card, together, could validly be hit onto the given
  // group in one action — any positive number of selected cards, not just one.
  const groupHittable = (targetPlayerId: string, groupIndex: number): boolean => {
    if (!canAct || publicState.turn.phase !== 'discard') return false
    if (!hasLaid || selectedCards.length === 0) return false
    const group = publicState.groups[targetPlayerId]?.[groupIndex]
    if (!group) return false
    const full = fullGroupCards(publicState.groups, publicState.hits, targetPlayerId, groupIndex)
    return canHitGroup(full, group.type, selectedCards)
  }

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

  const handleLayPhase = useCallback(() => {
    onLayPhase(selectedIds)
    setSelectedIds([])
  }, [onLayPhase, selectedIds])

  const handleHit = useCallback(
    (targetPlayerId: string, groupIndex: number) => {
      if (selectedCards.length === 0) return
      onHit(targetPlayerId, groupIndex, selectedCards.map((c) => c.id))
      setSelectedIds([])
    },
    [onHit, selectedCards],
  )

  const handleDiscard = useCallback(() => {
    onDiscard(selectedIds[0])
    setSelectedIds([])
  }, [onDiscard, selectedIds])

  // ---- Render ----
  const fanCount = Math.min(opponentHandCount, 14)

  return (
    <div className="p10-table">
      {/* Header */}
      <div className="p10-header">
        <div className="p10-header-left">
          <Wordmark small onClick={onLeave} />
          <span className="p10-game-label">Phase 10</span>
          <span className="p10-peer-strip">
            <span
              className="p10-peer-dot"
              style={{ background: connection === 'connected' ? 'var(--green)' : 'var(--coral)' }}
            />
            <span className="p10-peer-label">
              {connection === 'connected' ? `peer to peer with ${opponentName}` : `connection to ${opponentName} lost`}
            </span>
          </span>
        </div>
        <ScoreHeader
          youScore={publicState.scores[localPlayerId] ?? 0}
          youColor="var(--violet)"
          opponentName={opponentName}
          opponentScore={publicState.scores[opponentId] ?? 0}
          opponentColor={opponentColor}
          hint="lower wins"
        />
        <div className="p10-header-actions">
          <TurnSoundToggle enabled={turnSoundEnabled} onToggle={() => setTurnSoundEnabled(!turnSoundEnabled)} />
          <SoundToggle enabled={enabled} onToggle={() => setEnabled(!enabled)} />
          <button type="button" className="btn pill-small" onClick={() => setRulesOpen(true)}>Rules</button>
          <button type="button" className="btn btn-ghost" onClick={onLeave}>Leave</button>
        </div>
      </div>

      {/* Code chip */}
      <div style={{ marginBottom: 'clamp(16px, 2.4vw, 26px)' }}>
        <span className="chip" style={{ background: 'var(--yellow)', color: 'var(--ink)' }}>Phase 10 · {code}</span>
      </div>

      {/* Error banner */}
      {notice && <div className="p10-error-banner">{notice}</div>}

      {/* Main table card */}
      <div className="p10-table-card">
        {showIntro ? (
          <DealIntro
            others={[{ id: opponentId, name: opponentName, color: opponentColor, handSize: opponentHandCount }]}
            yourHandSize={hand.length}
            renderCardBack={(p) => <Phase10CardBack {...p} />}
            onComplete={() => setShowIntro(false)}
          />
        ) : (
        <>
        {/* Their side */}
        <div className="p10-their-side">
          <div className="p10-their-side-left">
            <div className="p10-their-name" style={{ color: opponentColor }}>{opponentName}</div>
            <div className="p10-their-count">{opponentHandCount} cards · hidden</div>
            {fanCount > 0 && (
              <div className="p10-their-fan">
                {Array.from({ length: fanCount }, (_, i) => (
                  <Phase10CardBack
                    key={i}
                    size="fan"
                    style={{ marginLeft: i === 0 ? 0 : -15 }}
                  />
                ))}
              </div>
            )}
          </div>
          <div className="p10-their-groups">
            {theirGroups.length > 0 ? (
              theirGroups.map((group, i) => {
                const selfExt = theirOwnHits.filter((h) => h.targetGroupIndex === i).flatMap((h) => h.cards)
                const hitTarget = groupHittable(opponentId, i)
                return (
                  <GroupCluster
                    key={group.zone.id}
                    cards={[...group.zone.cards, ...selfExt]}
                    type={group.type}
                    ownerColor={opponentColor}
                    ownerShadow="var(--grey-border-3)"
                    caption={`Phase ${group.phaseNumber}`}
                    onHit={hitTarget ? () => handleHit(opponentId, i) : undefined}
                  />
                )
              })
            ) : (
              <span className="p10-groups-empty">{opponentName} has laid nothing down yet</span>
            )}
            {theirCrossHits.map((h) => (
              <div key={h.id} className="p10-group-extension">
                <div className="p10-group-extension-caption">on your group</div>
                <GroupCluster
                  cards={h.cards}
                  type={myGroups[h.targetGroupIndex]?.type ?? 'set'}
                  ownerColor={opponentColor}
                  ownerShadow="var(--grey-border-3)"
                />
              </div>
            ))}
          </div>
        </div>

        {/* Ladder band */}
        <div className="p10-ladder-band">
          <PhaseLadder
            localPhaseIdx={myPhaseIdx}
            opponentPhaseIdx={oppPhaseIdx}
            opponentColor={opponentColor}
          />
        </div>

        {/* Centre band */}
        <div className="p10-centre">
          {/* Round-over banner */}
          {showRoundBanner && (
            <div className="p10-round-banner">{roundBannerText}</div>
          )}

          <div className="p10-centre-left">
            {/* Stock */}
            <div className="p10-stock-group">
              <div className="p10-stock-caption">stock {publicState.stockCount}</div>
              <div className="p10-stock-card-wrapper">
                <Phase10CardBack
                  size="stock"
                  canDraw={canDrawStock}
                  onClick={canDrawStock ? onDrawStock : undefined}
                />
              </div>
            </div>

            {/* Discard — top card only, no reach-in */}
            <div className="p10-discard-group">
              <div className="p10-discard-caption">Discard · {pile.length} {pile.length === 1 ? 'card' : 'cards'}</div>
              <div className="p10-discard-slot">
                {discardTop ? (
                  <Phase10Card
                    card={discardTop}
                    size="discard"
                    onClick={canDrawDiscard ? onDrawDiscard : undefined}
                  />
                ) : (
                  <span className="p10-discard-empty">Discard pile empty</span>
                )}
              </div>
            </div>
          </div>

          {/* Right group: turn chip + status */}
          <div className="p10-centre-right">
            <span
              className="p10-turn-chip"
              style={{ background: isMyTurn ? 'var(--green-text)' : opponentColor }}
            >
              {isMyTurn ? 'Your turn' : `${opponentName}'s turn`}
            </span>
            <StatusDisplay status={status} />
          </div>
        </div>

        {/* Your side */}
        <div className="p10-your-side">
          <div className="p10-your-band">
            <div className="p10-your-groups">
              {myGroups.length > 0 ? (
                myGroups.map((group, i) => {
                  const selfExt = myOwnHits.filter((h) => h.targetGroupIndex === i).flatMap((h) => h.cards)
                  const hitTarget = groupHittable(localPlayerId, i)
                  return (
                    <GroupCluster
                      key={group.zone.id}
                      cards={[...group.zone.cards, ...selfExt]}
                      type={group.type}
                      ownerColor={MY_COLOR}
                      caption={`Phase ${group.phaseNumber}`}
                      onHit={hitTarget ? () => handleHit(localPlayerId, i) : undefined}
                    />
                  )
                })
              ) : (
                <span className="p10-groups-empty">You have laid nothing down yet</span>
              )}
              {myCrossHits.map((h) => {
                const targetType = theirGroups[h.targetGroupIndex]?.type ?? 'set'
                return (
                  <div key={h.id} className="p10-group-extension">
                    <div className="p10-group-extension-caption">on {opponentName}'s group</div>
                    <GroupCluster cards={h.cards} type={targetType} ownerColor={MY_COLOR} />
                  </div>
                )
              })}
            </div>

            {/* Current phase pill */}
            <span className="p10-phase-pill">
              <span className="p10-phase-pill-dot" />
              Phase {myRequirement.phase} — {myRequirement.label}
            </span>
          </div>

          <div className="p10-hand-section">
            {/* Hand header */}
            <div className="p10-hand-header">
              <div className="p10-hand-header-left">
                <span className="p10-hand-label">Your hand</span>
                <span className="p10-hand-stats">{hand.length} cards</span>
              </div>
              <div className="p10-sort-toggle">
                <button
                  type="button"
                  className={`p10-sort-btn ${sortBy === 'color' ? 'p10-sort-btn--active' : ''}`}
                  onClick={() => setSortBy('color')}
                >
                  color
                </button>
                <button
                  type="button"
                  className={`p10-sort-btn ${sortBy === 'rank' ? 'p10-sort-btn--active' : ''}`}
                  onClick={() => setSortBy('rank')}
                >
                  order
                </button>
              </div>
            </div>

            {/* Hand cards */}
            <div className="p10-hand-fan">
              {sortedHand.map((card, i) => {
                const isLast = i === sortedHand.length - 1
                const isSeparatedDraw = isLast && justDrawn && card.id === justDrawn.id
                const marginLeft = i === 0 ? 0 : isSeparatedDraw ? 16 : -26
                return (
                  <Phase10Card
                    key={card.id}
                    card={card}
                    size="hand"
                    selected={selectedIds.includes(card.id)}
                    onClick={canAct ? () => handleCardClick(card.id) : undefined}
                    style={{ marginLeft }}
                  />
                )
              })}
            </div>

            {/* Actions row */}
            {!publicState.roundOver && (
              <div className="p10-actions">
                <button
                  type="button"
                  className="btn p10-action-btn"
                  disabled={!lEnabled}
                  onClick={handleLayPhase}
                >
                  {hasLaid ? 'Phase laid' : `Lay phase ${myRequirement.phase}`}
                </button>
                <button
                  type="button"
                  className="btn btn-coral p10-action-btn"
                  disabled={!dEnabled}
                  onClick={handleDiscard}
                >
                  Discard
                </button>
                <span className="p10-action-hint">{lHint || dHint}</span>
              </div>
            )}
          </div>
        </div>
        </>
        )}
      </div>

      {/* Footnote */}
      <p className="p10-footnote">Your hand never leaves this device — only the play does.</p>

      {rulesOpen && <Phase10RulesOverlay onClose={() => setRulesOpen(false)} />}
    </div>
  )
}
