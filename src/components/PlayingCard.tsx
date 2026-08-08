import type { Suit, Rank } from '../card-engine/cards'
import './PlayingCard.css'

// ---- Suit helpers (exported for M4 reuse in status-line, etc.) ----

const GLYPHS: Record<Suit, string> = {
  clubs: '\u2663',
  diamonds: '\u2666',
  hearts: '\u2665',
  spades: '\u2660',
  joker: '\uD83C\uDCCF',
}

const RED_SUITS = new Set<Suit>(['hearts', 'diamonds'])

export function suitGlyph(suit: Suit): string {
  return GLYPHS[suit]
}

/** Returns a CSS `var(…)` reference: `var(--coral)` for hearts/diamonds, `var(--ink)` otherwise. */
export function suitColor(suit: Suit): string {
  return RED_SUITS.has(suit) ? 'var(--coral)' : 'var(--ink)'
}

const SUIT_NAMES: Record<Suit, string> = {
  clubs: 'Clubs',
  diamonds: 'Diamonds',
  hearts: 'Hearts',
  spades: 'Spades',
  joker: 'Joker',
}

// ---- PlayingCard ----

export type PlayingCardSize = 'hand' | 'meld' | 'discard'

export interface PlayingCardProps {
  rank: Exclude<Rank, 'JOKER'>
  suit: Exclude<Suit, 'joker'>
  size: PlayingCardSize
  selected?: boolean
  /**
   * Border + shadow base colour for meld cards.
   * Defaults to `var(--green-text)` (“your” meld colour). Ignored for hand / discard.
   */
  ownerColor?: string
  /**
   * Shadow tint override for meld cards.
   * Falls back to `var(--grey-border)` when `ownerColor` is set without this,
   * and to the local `#b7e6d1` green tint when neither is set.
   * Ignored for hand / discard.
   */
  ownerShadow?: string
  className?: string
  style?: React.CSSProperties
  onClick?: () => void
}

export function PlayingCard({
  rank,
  suit,
  size,
  selected,
  ownerColor,
  ownerShadow,
  className,
  style,
  onClick,
}: PlayingCardProps) {
  const cls = [
    'playing-card',
    `playing-card--${size}`,
    selected && 'playing-card--selected',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  const customProps: Record<string, string | undefined> = {}
  if (size === 'meld') {
    if (ownerColor) customProps['--card-owner-color'] = ownerColor
    if (ownerShadow) {
      customProps['--card-owner-shadow'] = ownerShadow
    } else if (ownerColor) {
      customProps['--card-owner-shadow'] = 'var(--grey-border)'
    }
  }

  const cardStyle = { ...style, ...customProps } as React.CSSProperties

  const glyph = suitGlyph(suit)
  const color = suitColor(suit)

  const renderContent = () => {
    switch (size) {
      case 'hand':
        return (
          <>
            <span className="playing-card__corner">
              <span className="playing-card__rank">{rank}</span>
              <span className="playing-card__suit" style={{ color }}>
                {glyph}
              </span>
            </span>
            <span className="playing-card__bottom-suit" style={{ color }}>
              {glyph}
            </span>
          </>
        )
      case 'meld':
        return (
          <span className="playing-card__center">
            <span className="playing-card__rank">{rank}</span>
            <span className="playing-card__suit" style={{ color }}>
              {glyph}
            </span>
          </span>
        )
      case 'discard':
        return (
          <>
            <span className="playing-card__corner playing-card__corner--stacked">
              <span className="playing-card__rank">{rank}</span>
              <span className="playing-card__suit" style={{ color }}>
                {glyph}
              </span>
            </span>
            <span className="playing-card__bottom-suit playing-card__bottom-suit--discard" style={{ color }}>
              {glyph}
            </span>
          </>
        )
    }
  }

  const ariaLabel = selected
    ? `${rank} of ${SUIT_NAMES[suit]}, selected`
    : `${rank} of ${SUIT_NAMES[suit]}`

  return (
    <button
      type="button"
      className={cls}
      style={cardStyle}
      onClick={onClick}
      disabled={!onClick}
      aria-label={ariaLabel}
    >
      {renderContent()}
    </button>
  )
}

// ---- CardBack ----

export type CardBackSize = 'fan' | 'stock'

export interface CardBackProps {
  size: CardBackSize
  /** When true the stock border turns `var(--yellow)` signalling the player may draw. Ignored for fan. */
  canDraw?: boolean
  className?: string
  style?: React.CSSProperties
  onClick?: () => void
}

export function CardBack({ size, canDraw, className, style, onClick }: CardBackProps) {
  const cls = [
    'card-back',
    `card-back--${size}`,
    canDraw && 'card-back--can-draw',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <button
      type="button"
      className={cls}
      style={style}
      onClick={onClick}
      disabled={!onClick}
      aria-label={size === 'stock' ? 'Stock pile' : 'Face-down card'}
    >
      {size === 'stock' && <span className="card-back__mark" />}
    </button>
  )
}
