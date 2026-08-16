import { Fragment, useEffect, useRef, useState } from 'react'
import type { JSX } from 'react'
import { useSound, type SoundName } from '../hooks/useSound'

// ---------------------------------------------------------------------------
// Pure helper: the deal flight schedule.
//
// Round-robin over every "other" seat (in order) then "you", repeating,
// until all seats are fully dealt or `maxFlights` is hit — whichever comes
// first. If a seat runs out early, its turn is skipped and the remaining
// seats keep producing flights (never a flight for an exhausted seat).
// ---------------------------------------------------------------------------

export interface DealFlight {
  seat: 'you' | number // number = index into the `others` array
  seatIndex: number // 0-based index of this flight WITHIN that seat's flights (0, 1, 2, ...)
}

export function computeDealFlights(
  yourCount: number,
  otherCounts: number[],
  maxFlights = 10,
): DealFlight[] {
  const flights: DealFlight[] = []
  const otherDealt = otherCounts.map(() => 0)
  let yourDealt = 0
  const order: DealFlight['seat'][] = [...otherCounts.map((_, i) => i), 'you']
  let cursor = 0
  const hasMore = () =>
    yourDealt < yourCount || otherDealt.some((dealt, i) => dealt < otherCounts[i])
  while (flights.length < maxFlights && hasMore()) {
    const seat = order[cursor % order.length]
    cursor++
    if (seat === 'you') {
      if (yourDealt < yourCount) {
        flights.push({ seat: 'you', seatIndex: yourDealt })
        yourDealt++
      }
    } else if (otherDealt[seat] < otherCounts[seat]) {
      flights.push({ seat, seatIndex: otherDealt[seat] })
      otherDealt[seat]++
    }
  }
  return flights
}

// ---------------------------------------------------------------------------
// DealIntro — the table-opens-empty → shuffle → deal → settled sequence.
// Game-agnostic: the caller injects its own card-back art via `renderCardBack`
// (Rummy's `CardBack`, Phase 10's `Phase10CardBack`, and Dominoes' /
// Mexican Train's tile backs all share this exact
// `{ size: 'fan' | 'stock', style?, className? }` prop shape).
//
// Timing constants locked by spec 01 (confirmed against the Deal Intro
// prototype): 60ms empty → shuffle, 3 riffle ticks 170ms apart (510ms total),
// one flight every 130ms with a 0.26s cubic-bezier(0.25, 0.8, 0.35, 1) flight,
// and ~260ms after the last flight's snap before settling.
// ---------------------------------------------------------------------------

const EMPTY_PHASE_DELAY_MS = 60
const SHUFFLE_TICK_INTERVAL_MS = 170
const SHUFFLE_TICK_COUNT = 3
const FLIGHT_INTERVAL_MS = 130
const FLIGHT_TRANSITION = 'transform 0.26s cubic-bezier(0.25, 0.8, 0.35, 1)'
const FLIGHT_DURATION_MS = 260
const PILE_SLIVER_PX = 7 // px of each fan card visible in a growing pile

// Pure duration estimate for the full empty→shuffle→deal→settle sequence
// given how many cards will actually get an individual flight (i.e. the same
// value a caller passes as `maxFlights`, or the natural total if under the
// default cap). Lets a host-authoritative game (Uno) hold bot activity off
// until every client's local intro has had time to finish, without needing
// any client-to-host animation-complete signal — see spec 34i.
export function estimateDealIntroMs(totalFlights: number): number {
  const flights = Math.max(totalFlights, 1)
  return EMPTY_PHASE_DELAY_MS + SHUFFLE_TICK_INTERVAL_MS * SHUFFLE_TICK_COUNT
    + FLIGHT_INTERVAL_MS * Math.max(flights - 1, 0) + FLIGHT_DURATION_MS
}

type Phase = 'empty' | 'shuffle' | 'deal' | 'settled'

const STATUS_TEXT: Record<Phase, string> = {
  empty: "Table's empty.",
  shuffle: 'Shuffling the deck…',
  deal: 'Dealing…',
  settled: 'Dealt in.',
}

export interface DealIntroCardBackProps {
  size: 'fan' | 'stock'
  style?: React.CSSProperties
  className?: string
}

export interface DealIntroOtherSeat {
  id: string
  name: string
  color: string
  handSize: number
}

export interface DealIntroProps {
  others: DealIntroOtherSeat[] // every non-local seat, left-to-right / top-to-bottom
  yourHandSize: number
  renderCardBack: (props: DealIntroCardBackProps) => React.ReactNode
  onComplete: () => void
  /** Sound played once when shuffling starts; defaults to the card shuffle. */
  shuffleSound?: SoundName
  /**
   * Caps how many individual card flights animate before the rest of the
   * deal just appears (computeDealFlights' own default, 10). Callers whose
   * total dealt cards can exceed that — e.g. Uno's up-to-10-seat × 7-card
   * hands — should pass the real total so every card gets its own flight;
   * otherwise the leftover cards silently pop into the pile the instant the
   * capped animation ends, which reads as a broken shuffle.
   */
  maxFlights?: number
}

/** Position of `el` (border-box top-left) relative to `root`'s padding-box top-left. */
function measureRelativeTo(
  root: HTMLElement,
  el: HTMLElement,
): { x: number; y: number } {
  const rootRect = root.getBoundingClientRect()
  const elRect = el.getBoundingClientRect()
  return { x: elRect.left - rootRect.left, y: elRect.top - rootRect.top }
}

// ---- Layout styles (inline — see report for the CSS-vs-inline judgment) ----

const ROOT_STYLE: React.CSSProperties = {
  position: 'relative', // containing block for the flying card
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 26,
  padding: 28,
  background: 'var(--page-base)',
  borderRadius: 20,
}

const OTHERS_STYLE: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 10,
  maxWidth: 480,
}

const ROW_STYLE: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
}

const LABEL_STYLE: React.CSSProperties = {
  fontSize: 15,
  fontWeight: 700,
  color: 'var(--body-text)',
}

const PILE_STYLE: React.CSSProperties = {
  position: 'relative',
  height: 44, // one fan card (both games' fan backs are 30 × 44) so the row centers
}

const STATUS_STYLE: React.CSSProperties = {
  fontSize: 15,
  fontWeight: 700,
  color: 'var(--ink)',
}

export function DealIntro({
  others,
  yourHandSize,
  renderCardBack,
  onComplete,
  shuffleSound: shuffleSoundProp = 'shuffle',
  maxFlights,
}: DealIntroProps): JSX.Element {
  const { play } = useSound()

  const [phase, setPhase] = useState<Phase>('empty')
  const [flightIndex, setFlightIndex] = useState(0) // flights launched so far
  const [flyState, setFlyState] = useState<'idle' | 'atStock' | 'atSeat'>('idle')
  const [flyTransform, setFlyTransform] = useState('translate(0px, 0px)')
  const [shuffleTick, setShuffleTick] = useState(0)

  const rootRef = useRef<HTMLDivElement>(null)
  const stockRef = useRef<HTMLDivElement>(null)
  const otherPileRefs = useRef<(HTMLDivElement | null)[]>([])
  const yourPileRef = useRef<HTMLDivElement>(null)
  const timersRef = useRef<number[]>([])
  const rafsRef = useRef<number[]>([])
  const onCompleteRef = useRef(onComplete)
  const playRef = useRef(play)

  // The intro runs on a mount-only effect; refs keep it reading the latest values.
  onCompleteRef.current = onComplete
  playRef.current = play

  // Frozen at mount: these props don't change during one intro's lifetime
  // (enforced now instead of just assumed), so the animation sequencing, the
  // rendered pile counts, and the shuffle sound always agree with the values
  // the mount effect captured.
  const [flights] = useState(() =>
    computeDealFlights(yourHandSize, others.map((o) => o.handSize), maxFlights),
  )
  const [shuffleSound] = useState(() => shuffleSoundProp)

  useEffect(() => {
    const cancelled = { current: false }
    const timer = (ms: number, fn: () => void): void => {
      timersRef.current.push(window.setTimeout(fn, ms))
    }

    // 1. empty (60ms) → shuffle; the shuffle sound plays exactly once, at the
    //    moment shuffling starts (not per riffle tick).
    timer(EMPTY_PHASE_DELAY_MS, () => {
      setPhase('shuffle')
      playRef.current(shuffleSound)
      // 2. Three riffle ticks 170ms apart; the phase lasts 3 × 170 = 510ms.
      setShuffleTick(1)
      timer(SHUFFLE_TICK_INTERVAL_MS, () => setShuffleTick(2))
      timer(SHUFFLE_TICK_INTERVAL_MS * 2, () => setShuffleTick(3))
      timer(SHUFFLE_TICK_INTERVAL_MS * SHUFFLE_TICK_COUNT, startDeal)
    })

    function startDeal(): void {
      setPhase('deal')
      const dealFlights = flights
      if (dealFlights.length === 0) {
        settle()
        return
      }

      // 3. One reusable flying card, one flight every 130ms: snap to the
      //    stock (no transition), then on the next animation frame start the
      //    0.26s bezier transition to the target pile. The pile-count read
      //    below forces the browser to commit the snap before the transition
      //    starts (otherwise it would animate from the previous position).
      let index = 0
      const launch = (): void => {
        const flight = dealFlights[index]
        if (!flight) return
        const isLastFlight = index + 1 >= dealFlights.length
        const nextIndex = index + 1

        const rootEl = rootRef.current
        const stockEl = stockRef.current
        if (rootEl && stockEl) {
          const stockPos = measureRelativeTo(rootEl, stockEl)
          setFlyTransform(`translate(${stockPos.x}px, ${stockPos.y}px)`)
        }
        setFlyState('atStock')

        rafsRef.current.push(
          requestAnimationFrame(() => {
            if (cancelled.current) return
            const rootEl2 = rootRef.current
            const stockEl2 = stockRef.current
            const targetEl =
              flight.seat === 'you' ? yourPileRef.current : otherPileRefs.current[flight.seat]
            if (rootEl2 && stockEl2 && targetEl) {
              const stockPos = measureRelativeTo(rootEl2, stockEl2)
              const targetPos = measureRelativeTo(rootEl2, targetEl)
              const dx = targetPos.x - stockPos.x
              const dy = targetPos.y - stockPos.y
              setFlyTransform(
                `translate(${stockPos.x + dx}px, ${stockPos.y + dy}px)`,
              )
            }
            setFlyState('atSeat')
            setFlightIndex(nextIndex)
            if (isLastFlight) {
              // 4. Last flight: only once its frame has genuinely run (rAF is
              //    suspended while backgrounded, so this cannot race ahead of
              //    the visible animation), wait ~260ms for the transition to
              //    finish, then settle.
              timer(FLIGHT_DURATION_MS, settle)
            }
          }),
        )

        index = nextIndex
        if (!isLastFlight) {
          timer(FLIGHT_INTERVAL_MS, launch)
        }
      }
      launch()
    }

    function settle(): void {
      if (cancelled.current) return
      setPhase('settled')
      setFlyState('idle')
      onCompleteRef.current()
    }

    return () => {
      cancelled.current = true
      timersRef.current.forEach((id) => window.clearTimeout(id))
      timersRef.current = []
      rafsRef.current.forEach((id) => window.cancelAnimationFrame(id))
      rafsRef.current = []
    }
  }, [])

  const dealtSoFar = flights.slice(0, flightIndex)
  const yourPileCount = dealtSoFar.filter((f) => f.seat === 'you').length
  const otherPileCounts = others.map(
    (_, i) => dealtSoFar.filter((f) => f.seat === i).length,
  )

  // Riffle-split pulse: 3 alternating 6px shifts (right, left, right).
  const stockTransform =
    phase === 'shuffle' && shuffleTick > 0
      ? `translateX(${shuffleTick % 2 === 1 ? 6 : -6}px)`
      : undefined

  const flyStyle: React.CSSProperties = {
    position: 'absolute',
    left: 0,
    top: 0,
    transform: flyTransform,
    transition: flyState === 'atSeat' ? FLIGHT_TRANSITION : 'none',
    opacity: phase === 'deal' ? 1 : 0,
    pointerEvents: 'none',
    zIndex: 1,
  }

  const pileCards = (count: number): React.ReactNode =>
    Array.from({ length: count }, (_, i) => (
      <Fragment key={i}>
        {renderCardBack({
          size: 'fan',
          style: { position: 'absolute', left: i * PILE_SLIVER_PX, top: 0 },
        })}
      </Fragment>
    ))

  return (
    <div className="deal-intro" ref={rootRef} style={ROOT_STYLE}>
      <div style={OTHERS_STYLE}>
        {others.map((other, i) => (
          <div key={other.id} style={ROW_STYLE}>
            <span style={{ ...LABEL_STYLE, color: other.color }}>
              {other.name}
              {otherPileCounts[i] > 0 ? ` · ${otherPileCounts[i]}` : ''}
            </span>
            <div
              ref={(el) => { otherPileRefs.current[i] = el }}
              style={PILE_STYLE}
            >
              {pileCards(otherPileCounts[i])}
            </div>
          </div>
        ))}
      </div>

      <div style={STATUS_STYLE}>{STATUS_TEXT[phase]}</div>

      <div ref={stockRef}>
        {renderCardBack({
          size: 'stock',
          style: stockTransform ? { transform: stockTransform } : undefined,
        })}
      </div>

      <div style={ROW_STYLE}>
        <span style={LABEL_STYLE}>
          You
          {yourPileCount > 0 ? ` · ${yourPileCount}` : ''}
        </span>
        <div ref={yourPileRef} style={PILE_STYLE}>
          {pileCards(yourPileCount)}
        </div>
      </div>

      {renderCardBack({ size: 'stock', style: flyStyle })}
    </div>
  )
}
