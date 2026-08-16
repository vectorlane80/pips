import { useEffect, useMemo, useRef, useState } from 'react'
import type { UnoCard, UnoColor } from '../card-games/uno/deck.ts'
import type { UnoLastAction, UnoPublicState } from '../card-games/uno/state.ts'
import { UNO_TARGET, handHasLegalPlay, isUnoPlayable } from '../card-games/uno/state.ts'
import { currentPlayer } from '../engine/turn-engine.ts'
import { topCard } from '../card-engine/zones.ts'
import { UnoCardBack, UnoCardFace } from '../components/UnoCard'
import { Wordmark } from '../components/Wordmark'
import { SoundToggle } from '../components/SoundToggle'
import { TurnSoundToggle } from '../components/TurnSoundToggle'
import { useSound } from '../hooks/useSound'
import { useTurnStartSound } from '../hooks/useTurnStartSound'
import './UnoTable.css'

// ---- Props ----

export interface UnoTableProps {
  code: string
  localPlayerId: string
  names: Record<string, string>        // playerId -> display name
  colors: Record<string, string>       // playerId -> seat ink
  connection: 'connected' | 'disconnected'
  notice?: string | null
  publicState: UnoPublicState
  hand: UnoCard[]                      // your private hand
  onPlayCard: (cardId: string) => void
  onChooseColor: (color: UnoColor) => void
  onDraw: () => void
  onPass: () => void
  onCallUno: (targetPlayerId: string) => void
  onStartNextRound: () => void
  onOpenRules: () => void
  onLeave: () => void
}

// ---- Constants ----

// The four picker swatches — the same locked brand hexes as UnoCard.css.
const COLOR_SWATCHES: ReadonlyArray<{ color: UnoColor; hex: string }> = [
  { color: 'red', hex: '#e11d2e' },
  { color: 'yellow', hex: '#eab308' },
  { color: 'green', hex: '#16a34a' },
  { color: 'blue', hex: '#2f6fed' },
]

// ---- Uno-call button ----
//
// One quiet, uncolored button reused for every hand row (yours and each
// opponent's): a self-call on your own row, a catch on an opponent's — same
// callback, different targetPlayerId. Grayed out when there is nothing to
// call; the only enabled-state change is a subtle shift toward white/full
// opacity (see .uno-call-btn in UnoTable.css) — deliberately NOT the loud
// dark-pill sort-toggle treatment.

function UnoCallButton({ disabled, onClick, ariaLabel }: {
  disabled: boolean
  onClick: () => void
  ariaLabel: string
}) {
  return (
    <button type="button" className="uno-call-btn" disabled={disabled} onClick={onClick} aria-label={ariaLabel}>
      UNO!
    </button>
  )
}

// 1s self-priority stagger for CATCH buttons (someone else's window). Your
// own window is callable the instant it appears; catching another player is
// enabled only once the LOCAL client has seen that specific window for 1000ms.
// Re-keys off unoWindow.playerId — including a window closing and a DIFFERENT
// one opening directly (per spec 34b that can happen: player A's window dies
// uncalled and player B's turn immediately ends at 1 card too) — so the timer
// restarts instead of incorrectly staying "already elapsed" from a stale
// previous window. Uno-specific UI timing; deliberately not a shared hook.
function useCatchStagger(unoWindow: { playerId: string } | null, localPlayerId: string): boolean {
  const [staggerElapsed, setStaggerElapsed] = useState(false)
  useEffect(() => {
    setStaggerElapsed(false)
    if (unoWindow === null || unoWindow.playerId === localPlayerId) return
    const t = setTimeout(() => setStaggerElapsed(true), 1000)
    return () => clearTimeout(t)
  }, [unoWindow?.playerId, localPlayerId])
  return staggerElapsed
}

// ---- Log + status text helpers ----

function describeCard(card: NonNullable<UnoLastAction['card']>): string {
  switch (card.kind) {
    case 'number':
      return `${card.color} ${card.value}`
    case 'skip':
      return `${card.color} skip`
    case 'reverse':
      return `${card.color} reverse`
    case 'draw2':
      return `${card.color} +2`
    case 'wild':
      return 'Wild'
    case 'wild4':
      return 'Wild +4'
  }
}

function formatLastAction(
  lastAction: UnoLastAction | null,
  localPlayerId: string,
  names: Record<string, string>,
): string {
  if (lastAction === null) return 'No plays yet'
  const who = lastAction.by === localPlayerId ? 'You' : (names[lastAction.by] ?? lastAction.by)
  switch (lastAction.kind) {
    case 'play': {
      if (lastAction.card === null) return `${who} played a card`
      const base = `${who} played ${describeCard(lastAction.card)}`
      // drewCount records how many the NEXT player drew after a draw2/wild4.
      return lastAction.drewCount > 0 ? `${base} — ${lastAction.drewCount} cards drawn` : base
    }
    case 'draw': {
      const n = lastAction.drewCount
      return `${who} drew ${n} ${n === 1 ? 'card' : 'cards'}`
    }
    case 'pass':
      return `${who} passed`
  }
}

function computeStatus(
  publicState: UnoPublicState,
  isMyTurn: boolean,
  localPlayerId: string,
  names: Record<string, string>,
  hasPlayable: boolean,
): string {
  if (publicState.stage === 'roundOver') {
    if (publicState.roundResult === null) return 'Round blocked — no cards left to draw.'
    const outId = publicState.roundResult.outPlayerId
    const outName = outId === localPlayerId ? 'You' : (names[outId] ?? outId)
    return `${outName} went out — round over.`
  }
  if (publicState.stage === 'over') {
    const winnerId = publicState.matchWinnerId
    if (winnerId === null) return 'Match over.'
    return winnerId === localPlayerId ? 'You won the match!' : `${names[winnerId] ?? winnerId} won the match!`
  }
  if (publicState.unoWindow !== null) {
    const vulnId = publicState.unoWindow.playerId
    return vulnId === localPlayerId
      ? 'You have UNO! Call it before someone catches you.'
      : `${names[vulnId] ?? vulnId} has UNO!`
  }
  const currentId = currentPlayer(publicState.turn)
  if (publicState.pendingWild !== null) {
    return isMyTurn ? 'Choose a color to finish your play.' : `${names[currentId] ?? currentId} is choosing a color…`
  }
  if (!isMyTurn) return `${names[currentId] ?? currentId} is thinking…`
  if (publicState.hasDrawnThisTurn) return 'Play the card you drew, or pass.'
  return hasPlayable ? 'Play a card, or draw if you can’t.' : 'No playable cards — click the deck to draw.'
}

function computeRoundBanner(
  publicState: UnoPublicState,
  localPlayerId: string,
  names: Record<string, string>,
): string {
  if (publicState.stage === 'over') {
    const winnerId = publicState.matchWinnerId
    if (winnerId === null) return ''
    const winnerName = winnerId === localPlayerId ? 'You' : (names[winnerId] ?? winnerId)
    return `${winnerName} won the match with ${publicState.scores[winnerId] ?? 0} points!`
  }
  if (publicState.roundResult === null) return 'Round blocked — no cards left to draw.'
  const outId = publicState.roundResult.outPlayerId
  const outName = outId === localPlayerId ? 'You' : (names[outId] ?? outId)
  const gained = publicState.roundResult.pointsAdded[outId] ?? 0
  return `${outName} went out and scored ${gained} points!`
}

// ---- UnoTable ----

export function UnoTable({
  code,
  localPlayerId,
  names,
  colors,
  connection,
  notice,
  publicState,
  hand,
  onPlayCard,
  onChooseColor,
  onDraw,
  onPass,
  onCallUno,
  onStartNextRound,
  onOpenRules,
  onLeave,
}: UnoTableProps) {
  // ---- Derived ----
  const isMyTurn = currentPlayer(publicState.turn) === localPlayerId
  // Same bot-id convention as every other multi-seat game in this codebase.
  const humanCount = publicState.seatOrder.filter((id) => !id.startsWith('bot')).length
  const top = topCard(publicState.discardPile)
  const hasPlayable = top !== undefined && handHasLegalPlay(hand, top, publicState.activeColor)
  const canAct = isMyTurn && publicState.stage === 'play'
  const canDraw = canAct && publicState.pendingWild === null && !publicState.hasDrawnThisTurn && !hasPlayable
  const showColorPicker = canAct && publicState.pendingWild !== null
  const showPass = canAct && publicState.hasDrawnThisTurn && publicState.pendingWild === null
  const targetText = `first to ${UNO_TARGET}`
  const catchStaggered = useCatchStagger(publicState.unoWindow, localPlayerId)

  // ---- Local state ----
  const { play, enabled, setEnabled, turnSoundEnabled, setTurnSoundEnabled, playTurnStart } = useSound()
  useTurnStartSound(isMyTurn, humanCount, playTurnStart)

  // ---- Sounds ----
  // Diff room-state transitions, but only for my own actions (never for an
  // opponent's turn — otherwise a fast bot spams sound), the same
  // soundSigRef pattern Rummy/Phase10 use. Stock up = a fresh deal
  // (shuffle); discard growing = a play; stock shrinking = cards drawn.
  const stockCount = publicState.stockCount
  const discardLen = publicState.discardPile.cards.length
  const soundSigRef = useRef({
    stockCount, discardLen,
    stage: publicState.stage, matchWinnerId: publicState.matchWinnerId, wasMyTurn: isMyTurn,
  })
  const noticeSeenRef = useRef(!!notice)

  useEffect(() => {
    const p = soundSigRef.current
    if (p.wasMyTurn) {
      if (stockCount > p.stockCount) {
        play('shuffle')
      } else if (discardLen > p.discardLen) {
        play('card-play')
      } else if (stockCount < p.stockCount) {
        play('card-draw')
      }
    }
    if (p.stage !== 'roundOver' && publicState.stage === 'roundOver' && publicState.roundResult !== null) {
      play('round-win')
    }
    if (p.matchWinnerId === null && publicState.matchWinnerId !== null) {
      play('game-win')
    }
    if (notice && !noticeSeenRef.current) {
      play('error')
      noticeSeenRef.current = true
    } else if (!notice) {
      noticeSeenRef.current = false
    }
    soundSigRef.current = {
      stockCount, discardLen,
      stage: publicState.stage, matchWinnerId: publicState.matchWinnerId, wasMyTurn: isMyTurn,
    }
  }, [stockCount, discardLen, publicState.stage, publicState.roundResult, publicState.matchWinnerId, isMyTurn, notice, play])

  // ---- Computed ----
  const logLine = useMemo(
    () => formatLastAction(publicState.lastAction, localPlayerId, names),
    [publicState.lastAction, localPlayerId, names],
  )
  const status = useMemo(
    () => computeStatus(publicState, isMyTurn, localPlayerId, names, hasPlayable),
    [publicState, isMyTurn, localPlayerId, names, hasPlayable],
  )
  const roundBanner = useMemo(
    () => (publicState.stage === 'roundOver' || publicState.stage === 'over'
      ? computeRoundBanner(publicState, localPlayerId, names)
      : null),
    [publicState, localPlayerId, names],
  )
  const handHint = (() => {
    if (publicState.stage !== 'play' || !isMyTurn) return null
    if (publicState.pendingWild !== null) return 'Choose a color to finish your play.'
    if (publicState.hasDrawnThisTurn) return 'Play the card you drew, or pass.'
    return hasPlayable ? 'Click a card to play it.' : 'No playable cards — click the deck to draw.'
  })()

  // Client-side legality prediction only — the host is still the authority
  // and rejects an illegally-timed draw/play regardless. The card's onClick
  // is either wired or omitted entirely (per spec 34d, no opacity/ring
  // styling differs, only whether a click handler exists).
  const cardClickable = (card: UnoCard): boolean =>
    canAct && publicState.pendingWild === null && top !== undefined && isUnoPlayable(card, top, publicState.activeColor)

  // Per-seat Uno-call enable logic (client-side only; the host does not
  // enforce timing — see spec 34b). No window for this seat → always gray.
  // My own window → enabled immediately. Someone else's window → enabled
  // only after the 1s catch stagger.
  const unoCallDisabled = (seatPlayerId: string): boolean => {
    if (publicState.unoWindow === null || publicState.unoWindow.playerId !== seatPlayerId) return true
    if (seatPlayerId === localPlayerId) return false
    return !catchStaggered
  }

  // ---- Render ----
  const opponentIds = publicState.seatOrder.filter((id) => id !== localPlayerId)

  return (
    <div className="uno-table">
      {/* Header */}
      <div className="uno-header">
        <div className="uno-header-left">
          <Wordmark small onClick={onLeave} />
          <span className="uno-game-label">Uno</span>
          <span className="uno-peer-strip">
            <span
              className="uno-peer-dot"
              style={{ background: connection === 'connected' ? 'var(--green)' : 'var(--coral)' }}
            />
            <span className="uno-peer-label">
              {connection === 'connected' ? 'Live' : 'Connection lost'}
            </span>
          </span>
        </div>
        <div className="uno-header-actions">
          <TurnSoundToggle enabled={turnSoundEnabled} onToggle={() => setTurnSoundEnabled(!turnSoundEnabled)} />
          <SoundToggle enabled={enabled} onToggle={() => setEnabled(!enabled)} />
          <button type="button" className="btn pill-small" onClick={onOpenRules}>Rules</button>
          <button type="button" className="btn btn-ghost" onClick={onLeave}>Leave</button>
        </div>
      </div>

      {/* Code chip */}
      <div style={{ marginBottom: 'clamp(16px, 2.4vw, 26px)' }}>
        <span className="chip" style={{ background: 'var(--yellow)', color: 'var(--ink)' }}>Uno · {code}</span>
      </div>

      {/* Error banner */}
      {notice && <div className="uno-error-banner">{notice}</div>}

      {/* Main table card: the board column with the rail to its right.
          row-reverse puts the rail (DOM-first of the row pair) on the table's
          right while keeping wrap order — on narrow screens the rail wraps
          back to its own row above the board column. */}
      <div className="uno-table-card">
        {/* Right rail: scoreboard + turn log + status */}
        <div className="uno-rail">
          <span className="uno-rail-caption">Round {publicState.round + 1} · {targetText}</span>

          <div className="uno-scoreboard">
            {publicState.seatOrder.map((pid) => {
              const isTurn = pid === currentPlayer(publicState.turn)
              const color = colors[pid] ?? 'var(--slate-pip)'
              const isVulnerable = publicState.unoWindow?.playerId === pid
              const sub = isTurn
                ? (pid === localPlayerId ? 'your turn' : 'their turn')
                : isVulnerable
                  ? 'has UNO!'
                  : targetText
              return (
                <div
                  key={pid}
                  className={`uno-score-row${isTurn ? ' uno-score-row--turn' : ''}`}
                  style={isTurn ? { background: color, borderColor: color, color: '#fff' } : undefined}
                >
                  <span
                    className="uno-seat-dot"
                    style={isTurn
                      ? { background: '#fff', borderColor: 'rgba(255, 255, 255, 0.85)' }
                      : { background: color }}
                  />
                  <div className="uno-score-info">
                    <span className="uno-score-name">{names[pid] ?? pid}{pid === localPlayerId ? ' (you)' : ''}</span>
                    <span className="uno-score-sub">{sub}</span>
                  </div>
                  <span className="uno-score-value">{publicState.scores[pid] ?? 0}</span>
                </div>
              )
            })}
          </div>

          <div className="uno-log">
            <span className="uno-rail-title">Turn log</span>
            <span className="uno-log-line">{logLine}</span>
          </div>

          <div className="uno-status">{status}</div>
        </div>

        {/* Board column: opponents, deck + discard, your hand */}
        <div className="uno-board-col">
          {/* Round-over banner — this screen renders the state and the
              continue button; pacing/auto-advance belongs to the wiring
              layer (spec 34f), same separation as every sibling Table. */}
          {roundBanner !== null && (
            <div className="uno-round-banner">
              <span>{roundBanner}</span>
              {publicState.stage === 'roundOver' && (
                <button type="button" className="btn pill-small" onClick={onStartNextRound}>
                  Next round
                </button>
              )}
            </div>
          )}

          {/* Opponent rail: one row per opponent seat, current seat
              highlighted with the seat color + a turn tag */}
          <div className="uno-opp-rail">
            {opponentIds.map((seatId) => {
              const color = colors[seatId] ?? 'var(--slate-pip)'
              const isTurn = seatId === currentPlayer(publicState.turn)
              const count = publicState.handCounts[seatId] ?? 0
              const stackCount = Math.min(count, 14) // visual cap, like Rummy/Phase10
              return (
                <div
                  key={seatId}
                  className={`uno-opp-row${isTurn ? ' uno-opp-row--turn' : ''}`}
                  style={isTurn ? { borderColor: color } : undefined}
                >
                  <span className="uno-seat-dot" style={{ background: color }} />
                  <span className="uno-opp-name" style={{ color }}>{names[seatId] ?? seatId}</span>
                  <div className="uno-opp-stack">
                    {Array.from({ length: stackCount }, (_, i) => (
                      <UnoCardBack key={i} size="small" />
                    ))}
                  </div>
                  <span className="uno-opp-count">{count} cards</span>
                  {isTurn && <span className="uno-turn-tag" style={{ background: color }}>turn</span>}
                  <UnoCallButton
                    disabled={unoCallDisabled(seatId)}
                    onClick={() => onCallUno(seatId)}
                    ariaLabel={`Call UNO on ${names[seatId] ?? seatId}`}
                  />
                </div>
              )
            })}
          </div>

          {/* Centre band: deck + discard, and the color picker when a wild
              is pending on YOUR turn (the only time this screen shows it) */}
          <div className="uno-centre">
            <div className="uno-centre-left">
              <div className="uno-stock-group">
                <div className="uno-stock-caption">
                  stock {publicState.stockCount} · {publicState.houseRules.drawUntilPlayable ? 'Draw until you can play' : 'Draw a card'}
                </div>
                <div className="uno-stock-card-wrapper">
                  <UnoCardBack
                    size="stock"
                    onClick={canDraw ? onDraw : undefined}
                    disabled={!canDraw}
                  />
                </div>
              </div>

              <div className="uno-discard-group">
                <div className="uno-discard-caption">
                  Discard · {publicState.discardPile.cards.length} {publicState.discardPile.cards.length === 1 ? 'card' : 'cards'}
                </div>
                <div className="uno-discard-slot">
                  {top ? (
                    <UnoCardFace card={top} size="discard" />
                  ) : (
                    <span className="uno-discard-empty">Discard pile empty</span>
                  )}
                </div>
              </div>
            </div>

            {showColorPicker && (
              <div className="uno-centre-right">
                <div className="uno-color-picker">
                  <span className="uno-color-picker-label">Choose a color</span>
                  <div className="uno-color-swatches">
                    {COLOR_SWATCHES.map(({ color, hex }) => (
                      <button
                        key={color}
                        type="button"
                        className="uno-color-swatch"
                        style={{ background: hex }}
                        onClick={() => onChooseColor(color)}
                        aria-label={`Choose ${color}`}
                      />
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Your hand */}
          <div className="uno-hand-section">
            <div className="uno-hand-header">
              <div className="uno-hand-header-left">
                <span className="uno-hand-label">Your hand</span>
                <span className="uno-hand-stats">{hand.length} {hand.length === 1 ? 'card' : 'cards'}</span>
              </div>
              <UnoCallButton
                disabled={unoCallDisabled(localPlayerId)}
                onClick={() => onCallUno(localPlayerId)}
                ariaLabel="Call your own UNO"
              />
            </div>

            <div className="uno-hand-fan">
              {hand.map((card) => (
                <UnoCardFace
                  key={card.id}
                  card={card}
                  size="hand"
                  onClick={cardClickable(card) ? () => onPlayCard(card.id) : undefined}
                />
              ))}
            </div>

            {(showPass || handHint !== null) && (
              <div className="uno-actions">
                {showPass && (
                  <button type="button" className="btn uno-action-btn" onClick={onPass}>Pass</button>
                )}
                {handHint !== null && <span className="uno-action-hint">{handHint}</span>}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Footnote */}
      <p className="uno-footnote">Your hand never leaves this device — only the play does.</p>
    </div>
  )
}
