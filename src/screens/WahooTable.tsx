import { useEffect, useMemo, useRef, useState } from 'react'
import type { Hole, WahooBoard } from '../board-games/wahoo/board'
import { createBoard, trackIndexFor } from '../board-games/wahoo/board'
import { exitTargetRel, legalMoves, type WahooMove, type WahooPublicState } from '../board-games/wahoo/state'
import { currentPlayer } from '../engine/turn-engine'
import { Die } from '../components/Die'
import { SoundToggle } from '../components/SoundToggle'
import { Wordmark } from '../components/Wordmark'
import { WahooRulesOverlay } from './WahooRulesOverlay'
import { useSound } from '../hooks/useSound'
import './WahooTable.css'

// ---- Props ----

export interface WahooTableProps {
  code: string
  localPlayerId: string
  localName: string
  names: Record<string, string>        // playerId -> display name
  connection: 'connected' | 'disconnected'
  notice?: string | null
  publicState: WahooPublicState
  onRoll: () => void
  onMove: (move: WahooMove) => void
  onOpenRules: () => void
  onLeave: () => void
}

// ---- Arm palette (fixed per arm index 0..3, assigned at game start) ----

const ARM_COLORS = ['#ef4444', '#3b82f6', '#22c55e', '#eab308']
const CORNER_RING = 'rgba(147, 51, 234, 0.5)' // brand-tinted ring on the four corner holes
const GREY_BORDER = 'var(--grey-border)' // unseated arms: grey instead of an arm color

function seatColor(publicState: WahooPublicState, playerId: string): string {
  return ARM_COLORS[publicState.seatArms[playerId]]
}

// Arm color as an rgba fill at the given alpha (home-lane holes use 0.45).
function armFill(arm: number, alpha: number): string {
  const hex = ARM_COLORS[arm]
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`
}

// ---- Cross board geometry (viewBox unit space, -8..8) ----
// The solid cream cross is two bars plus four 45° corner plates. Every shape
// is rendered twice in one SVG — a stroked pass then a fill-only pass — so the
// second pass covers the interior strokes and only the union's outer outline
// survives (a welded single-outline cross).
const CROSS_SHAPES: ReadonlyArray<{ x: number; y: number; width: number; height: number; rx: number; cx?: number; cy?: number }> = [
  { x: -7.75, y: -1.75, width: 15.5, height: 3.5, rx: 0.3 }, // horizontal bar
  { x: -1.75, y: -7.75, width: 3.5, height: 15.5, rx: 0.3 }, // vertical bar
  { x: -2.85, y: -2.85, width: 1.7, height: 1.7, rx: 0.3, cx: -2, cy: -2 },
  { x: 1.15, y: -2.85, width: 1.7, height: 1.7, rx: 0.3, cx: 2, cy: -2 },
  { x: -2.85, y: 1.15, width: 1.7, height: 1.7, rx: 0.3, cx: -2, cy: 2 },
  { x: 1.15, y: 1.15, width: 1.7, height: 1.7, rx: 0.3, cx: 2, cy: 2 },
]

function CrossRect({ shape, stroked }: { shape: (typeof CROSS_SHAPES)[number]; stroked: boolean }) {
  return (
    <rect
      x={shape.x}
      y={shape.y}
      width={shape.width}
      height={shape.height}
      rx={shape.rx}
      fill="#fbfaf6"
      {...(shape.cx !== undefined ? { transform: `rotate(45 ${shape.cx} ${shape.cy})` } : {})}
      {...(stroked ? { stroke: '#17173a', strokeWidth: 0.18 } : {})}
    />
  )
}

// ---- Geometry helpers ----

// The physical hole a marble currently occupies (-1 base, -2 center, 0..51
// track relative to the arm's entry, 52..55 home lane, innermost first).
function marbleHole(board: WahooBoard, publicState: WahooPublicState, playerId: string, marbleIdx: number): Hole {
  const arm = publicState.seatArms[playerId]
  const p = publicState.positions[playerId][marbleIdx]
  if (p === -1) return board.bases[arm][marbleIdx]
  if (p === -2) return board.center
  if (p <= 51) return board.track[trackIndexFor(arm, p)]
  return board.homes[arm][p - 52]
}

// The physical hole a legal move's marble ends at: out → the arm's entry hole,
// advance → the track/lane landing hole, shortcut → center, exit → the
// diagonal corner.
function destinationHole(board: WahooBoard, publicState: WahooPublicState, playerId: string, die: number, move: WahooMove): Hole {
  const arm = publicState.seatArms[playerId]
  if (move.kind === 'out') return board.track[trackIndexFor(arm, 0)]
  if (move.kind === 'shortcut') return board.center
  if (move.kind === 'exit') return board.track[exitTargetRel(publicState.centerBy!.entryCornerRel)]
  const to = publicState.positions[playerId][move.marbleIdx] + die
  return to <= 51 ? board.track[trackIndexFor(arm, to)] : board.homes[arm][to - 52]
}

function BoardHole({ x, y, unit, fill = '#fff', border = 'rgba(23, 23, 58, 0.3)', borderWidth = 2, shadow, size = 0.62 }: {
  x: number
  y: number
  unit: number
  fill?: string
  border?: string
  borderWidth?: number
  shadow?: string // 2px box-shadow ring outside the border
  size?: number
}) {
  return (
    <span
      className="wh-hole"
      style={{
        left: `calc(50% + ${x * unit}px)`,
        top: `calc(50% + ${y * unit}px)`,
        width: size * unit,
        height: size * unit,
        background: fill,
        borderColor: border,
        borderWidth,
        ...(shadow !== undefined ? { boxShadow: `0 0 0 2px ${shadow}` } : {}),
      }}
    />
  )
}

// ---- Status lines ----

function computeStatusLine(publicState: WahooPublicState, localPlayerId: string, names: Record<string, string>): string {
  const ev = publicState.lastEvent
  if (ev === null) {
    const cur = currentPlayer(publicState.turn)
    return cur === localPlayerId
      ? 'Your roll — bring a marble out on a 1 or 6.'
      : `${names[cur] ?? cur} rolls first.`
  }
  const actor = ev.by === localPlayerId ? 'You' : (names[ev.by] ?? ev.by)
  switch (ev.kind) {
    case 'roll':
      return `${actor} rolled a ${ev.die} — move a marble.`
    case 'move':
    case 'out':
    case 'shortcut':
    case 'exit':
      if (ev.bumpedId !== null) return `${actor} bumped ${names[ev.bumpedId] ?? ev.bumpedId}!`
      if (ev.kind === 'move') return `${actor} moved a marble.`
      if (ev.kind === 'out') return `${actor} brought a marble out.`
      if (ev.kind === 'shortcut') return `${actor} took the center shortcut!`
      return `${actor} left the center.`
    case 'bust':
      return `Three sixes — ${actor === 'You' ? 'your' : `${actor}'s`} marble goes home!`
    case 'pass':
      return actor === 'You' ? 'You have no move — you pass.' : `${actor} has no move — passes.`
    case 'win':
      return actor === 'You' ? 'You win!' : `${actor} wins!`
  }
}

// ---- WahooTable ----

export function WahooTable({
  code,
  localPlayerId,
  localName,
  names,
  connection,
  notice,
  publicState,
  onRoll,
  onMove,
  onOpenRules,
  onLeave,
}: WahooTableProps) {
  void localName // preserved in props for M4 wiring; unused in this presentational milestone
  void onOpenRules // rules overlay now managed as local state; prop kept for future wiring

  // ---- Derived ----
  const myTurn = currentPlayer(publicState.turn) === localPlayerId
  const canRoll = publicState.stage === 'play' && myTurn && publicState.turn.phase === 'roll'
  const myMovePhase = publicState.stage === 'play' && myTurn && publicState.turn.phase === 'move' && publicState.die !== null
  const myMoves = useMemo(() => {
    if (!myMovePhase) return []
    return legalMoves(publicState, localPlayerId, publicState.die!)
  }, [myMovePhase, publicState, localPlayerId])

  // ---- Local state ----
  const { play, enabled, setEnabled } = useSound()
  const [rulesOpen, setRulesOpen] = useState(false)
  const [paneW, setPaneW] = useState(0)
  // The most recent roll, kept so the die still shows a (muted) value between
  // turns — blank only before the first roll of the game.
  const [lastRoll, setLastRoll] = useState<{ die: number; by: string } | null>(null)
  // Marble-first selection for shared (contested) destinations: null = plain
  // destination-click mode; a marble index narrows the visible targets to that
  // marble's moves (see destGroups/pendingContest below).
  const [selectedMarbleIdx, setSelectedMarbleIdx] = useState<number | null>(null)
  const boardRef = useRef<HTMLDivElement>(null)

  // Measure the square board pane; unit = pane/16 (the board spans -7..7 units).
  useEffect(() => {
    const el = boardRef.current
    if (!el) return
    const measure = () => setPaneW(el.clientWidth)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const board = useMemo(() => createBoard(), [])
  // paneW/16; the SVG cross viewBox "-8 -8 16 16" must match this scale.
  const unit = paneW / 16
  const boardReady = paneW > 0

  // Sound effects — diff lastEvent identity (every accepted action replaces it;
  // the HostSession revision lives in App, not in publicState). Both players
  // hear everything — no wasMyTurn gate.
  const lastEventRef = useRef(publicState.lastEvent)
  useEffect(() => {
    const ev = publicState.lastEvent
    if (ev !== lastEventRef.current) {
      if (ev !== null) {
        if (ev.kind === 'roll') {
          play('dice-roll')
          setLastRoll({ die: ev.die, by: ev.by })
        }
        else if (ev.kind === 'bust') play('farkle-bust')
        else if (ev.kind === 'move' || ev.kind === 'out' || ev.kind === 'shortcut' || ev.kind === 'exit') {
          if (ev.bumpedId !== null) play('farkle-bust')
          else play('piece-drop')
        }
      }
      lastEventRef.current = ev
    }
  }, [publicState.lastEvent, play])

  // ---- Board content ----
  // Arms with a seated player (2P leaves two arms empty, 3P one muted arm);
  // everything else renders grey per §4.
  const seatedArms = useMemo(() => new Set(Object.values(publicState.seatArms)), [publicState.seatArms])
  const entryByTrackIdx = useMemo(() => {
    const m = new Map<number, number>() // track index -> arm whose entry it is
    board.entries.forEach((idx, arm) => m.set(idx, arm))
    return m
  }, [board])

  // Destination targets, one pulsing ring per destination hole, grouped by
  // landing hole. A hole reached by exactly one move is a plain click-to-
  // execute target; a hole reached by several moves (several 'out' candidates
  // sharing the entry, or an 'exit' sharing the diagonal corner with an
  // 'advance' — see the oscar.test.ts probes) renders in the contested style
  // and defers to marble-first selection instead.
  const destGroups = useMemo(() => {
    const byDest = new Map<string, { dest: Hole; moves: WahooMove[] }>()
    for (const m of myMoves) {
      const dest = destinationHole(board, publicState, localPlayerId, publicState.die!, m)
      const key = `${dest.x}:${dest.y}`
      const group = byDest.get(key)
      if (group) group.moves.push(m)
      else byDest.set(key, { dest, moves: [m] })
    }
    return [...byDest.values()]
  }, [myMoves, board, publicState, localPlayerId])

  const uniqueTargets = useMemo(() => destGroups.filter((g) => g.moves.length === 1), [destGroups])
  const contestedTargets = useMemo(() => destGroups.filter((g) => g.moves.length >= 2), [destGroups])

  // The contested destination the selected marble is a candidate of, if any.
  // A marble can be a candidate of at most one shared hole, so this lookup is
  // unambiguous; that hole's candidate set gets the selectable (execute) rings.
  const pendingContest = useMemo(() => {
    if (selectedMarbleIdx === null) return null
    return contestedTargets.find((g) => g.moves.some((m) => m.marbleIdx === selectedMarbleIdx)) ?? null
  }, [selectedMarbleIdx, contestedTargets])

  const candidateIdxs = useMemo(() => {
    if (!pendingContest) return new Set<number>()
    return new Set(pendingContest.moves.map((m) => m.marbleIdx))
  }, [pendingContest])

  // With a marble selected, the visible targets narrow to that marble's moves.
  const selectedTargets = useMemo(() => {
    if (selectedMarbleIdx === null) return []
    const byDest = new Map<string, { dest: Hole; move: WahooMove }>()
    for (const m of myMoves) {
      if (m.marbleIdx !== selectedMarbleIdx) continue
      const dest = destinationHole(board, publicState, localPlayerId, publicState.die!, m)
      const key = `${dest.x}:${dest.y}`
      if (!byDest.has(key)) byDest.set(key, { dest, move: m })
    }
    return [...byDest.values()]
  }, [selectedMarbleIdx, myMoves, board, publicState, localPlayerId])

  // The selection only means something for the current legal-move set; any
  // action that changes it (a move, a roll, a turn hand-off) drops the
  // selection so a stale marble choice can't resurrect on a later turn.
  useEffect(() => {
    setSelectedMarbleIdx(null)
  }, [myMoves])

  // Marbles that have ≥1 legal move (ring buttons: click to filter to that
  // marble's targets, or — for a pending-contest candidate — click to execute
  // that marble's move to the shared hole).
  const movableMarbleIdxs = useMemo(() => {
    const seen = new Set<number>()
    for (const m of myMoves) seen.add(m.marbleIdx)
    return [...seen]
  }, [myMoves])

  const status = useMemo(
    () => computeStatusLine(publicState, localPlayerId, names),
    [publicState, localPlayerId, names],
  )

  // ---- Render ----
  return (
    <div className="wh-table">
      {/* Header */}
      <div className="wh-header">
        <div className="wh-header-left">
          <Wordmark small onClick={onLeave} />
          <span className="wh-game-label">Wahoo</span>
          <span className="wh-peer-strip">
            <span
              className="wh-peer-dot"
              style={{ background: connection === 'connected' ? 'var(--green)' : 'var(--coral)' }}
            />
            <span className="wh-peer-label">
              {connection === 'connected' ? 'Live' : 'Connection lost'}
            </span>
          </span>
        </div>
        <div className="wh-header-actions">
          <SoundToggle enabled={enabled} onToggle={() => setEnabled(!enabled)} />
          <button type="button" className="btn pill-small" onClick={() => setRulesOpen(true)}>Rules</button>
          <button type="button" className="btn btn-ghost" onClick={onLeave}>Leave</button>
        </div>
      </div>

      {/* Code chip */}
      <div style={{ marginBottom: 'clamp(16px, 2.4vw, 26px)' }}>
        <span className="chip" style={{ background: 'var(--yellow)', color: 'var(--ink)' }}>Wahoo · {code}</span>
      </div>

      {/* Error banner */}
      {notice && <div className="wh-error-banner">{notice}</div>}

      {/* Main table card */}
      <div className="wh-table-card">
        {/* Action strip */}
        <div className="wh-action-strip">
          <div className="wh-die-col">
            <Die value={publicState.die ?? lastRoll?.die ?? 0} muted={publicState.die === null} />
            {lastRoll !== null && (
              <span className="wh-die-caption">
                {lastRoll.by === localPlayerId ? 'You' : (names[lastRoll.by] ?? lastRoll.by)}
              </span>
            )}
          </div>
          <div className="wh-action-main">
            <button type="button" className="btn btn-coral wh-roll-btn" onClick={onRoll} disabled={!canRoll}>
              Roll
            </button>
            <div className="wh-status">{status}</div>
          </div>
        </div>

        {/* Board — clicking anywhere off a target or marble ring clears the selection */}
        <div className="wh-board" ref={boardRef} onClick={() => setSelectedMarbleIdx(null)}>
          {boardReady && (
            <>
              {/* Solid cream cross under the holes; the felt shows around it and
                  under the bases. Two passes per shape: stroked then fill-only,
                  so interior strokes vanish and one outer outline remains. */}
              <svg className="wh-cross" viewBox="-8 -8 16 16" aria-hidden="true">
                {CROSS_SHAPES.map((s, i) => (
                  <CrossRect key={`o${i}`} shape={s} stroked />
                ))}
                {CROSS_SHAPES.map((s, i) => (
                  <CrossRect key={`f${i}`} shape={s} stroked={false} />
                ))}
              </svg>

              {/* 52 track holes, drilled into the cross; entry holes ring in
                  their arm's color, corner holes ring in the brand tint */}
              {board.track.map((h, i) => {
                const entryArm = entryByTrackIdx.get(i)
                const shadow = entryArm !== undefined
                  ? (seatedArms.has(entryArm) ? ARM_COLORS[entryArm] : GREY_BORDER)
                  : board.corners.includes(i) ? CORNER_RING : undefined
                return (
                  <BoardHole key={`t${i}`} x={h.x} y={h.y} unit={unit} shadow={shadow} />
                )
              })}

              {/* Home lane holes: arm color at 45% + arm border; unseated arms grey */}
              {board.homes.map((lane, arm) =>
                lane.map((h, j) => {
                  const seated = seatedArms.has(arm)
                  return (
                    <BoardHole
                      key={`h${arm}-${j}`}
                      x={h.x}
                      y={h.y}
                      unit={unit}
                      fill={seated ? armFill(arm, 0.45) : 'var(--grey-fill)'}
                      border={seated ? ARM_COLORS[arm] : GREY_BORDER}
                    />
                  )
                }),
              )}

              {/* Base holes on the felt: cream fill, 3px arm ring; unseated arms grey */}
              {board.bases.map((cluster, arm) =>
                cluster.map((h, j) => {
                  const seated = seatedArms.has(arm)
                  return (
                    <BoardHole
                      key={`b${arm}-${j}`}
                      x={h.x}
                      y={h.y}
                      unit={unit}
                      fill="#fbfaf6"
                      border={seated ? ARM_COLORS[arm] : GREY_BORDER}
                      borderWidth={3}
                    />
                  )
                }),
              )}

              {/* Center: larger hole with the brand ring */}
              <span
                className="wh-center"
                style={{ width: 1.5 * unit, height: 1.5 * unit }}
              />

              {/* Marbles: filled circles in seat color, ink border + hard shadow */}
              {Object.entries(publicState.positions).map(([pid, positions]) =>
                positions.map((_p, i) => {
                  const h = marbleHole(board, publicState, pid, i)
                  return (
                    <span
                      key={`${pid}-${i}`}
                      className="wh-marble"
                      style={{
                        width: 0.85 * unit,
                        height: 0.85 * unit,
                        background: seatColor(publicState, pid),
                        transform: `translate(calc(-50% + ${h.x * unit}px), calc(-50% + ${h.y * unit}px))`,
                      }}
                    />
                  )
                }),
              )}

              {/* Movable marbles: ring buttons. A plain click filters to that
                  marble's targets; a candidate of the pending contested
                  destination executes its move instead. */}
              {movableMarbleIdxs.map((marbleIdx) => {
                const h = marbleHole(board, publicState, localPlayerId, marbleIdx)
                const isCandidate = candidateIdxs.has(marbleIdx)
                const isSelected = selectedMarbleIdx === marbleIdx
                return (
                  <button
                    key={`mr${marbleIdx}`}
                    type="button"
                    className={`wh-marble-ring${isCandidate ? ' wh-marble-ring--candidate' : isSelected ? ' wh-marble-ring--selected' : ''}`}
                    style={{
                      left: `calc(50% + ${h.x * unit}px)`,
                      top: `calc(50% + ${h.y * unit}px)`,
                      width: 0.96 * unit,
                      height: 0.96 * unit,
                    }}
                    onClick={(e) => {
                      e.stopPropagation()
                      if (isCandidate && pendingContest) {
                        const move = pendingContest.moves.find((m) => m.marbleIdx === marbleIdx)
                        if (move) onMove(move)
                      } else {
                        setSelectedMarbleIdx(marbleIdx)
                      }
                    }}
                    aria-label={isCandidate ? 'Move this marble to the shared destination' : 'Show this marble’s destinations'}
                  />
                )
              })}

              {/* Destination targets: unique holes click to move; shared holes
                  click to enter marble-first selection instead. With a marble
                  selected, only its destinations are shown — the contested one
                  becomes pending, and clicking it confirms that marble's move. */}
              {selectedMarbleIdx === null ? (
                <>
                  {uniqueTargets.map((t) => (
                    <button
                      key={`t${t.dest.x}:${t.dest.y}`}
                      type="button"
                      className="wh-target"
                      style={{
                        left: `calc(50% + ${t.dest.x * unit}px)`,
                        top: `calc(50% + ${t.dest.y * unit}px)`,
                        width: 0.68 * unit,
                        height: 0.68 * unit,
                      }}
                      onClick={(e) => {
                        e.stopPropagation()
                        onMove(t.moves[0])
                      }}
                      aria-label="Move a marble here"
                    />
                  ))}
                  {contestedTargets.map((t) => (
                    <button
                      key={`c${t.dest.x}:${t.dest.y}`}
                      type="button"
                      className="wh-target wh-target--contested"
                      style={{
                        left: `calc(50% + ${t.dest.x * unit}px)`,
                        top: `calc(50% + ${t.dest.y * unit}px)`,
                        width: 0.68 * unit,
                        height: 0.68 * unit,
                      }}
                      onClick={(e) => {
                        e.stopPropagation()
                        setSelectedMarbleIdx(t.moves[0].marbleIdx)
                      }}
                      aria-label="Shared destination — choose a marble"
                    />
                  ))}
                </>
              ) : (
                selectedTargets.map((t) => {
                  const isPending = pendingContest !== null
                    && t.dest.x === pendingContest.dest.x
                    && t.dest.y === pendingContest.dest.y
                  return (
                    <button
                      key={`s${t.dest.x}:${t.dest.y}`}
                      type="button"
                      className={`wh-target${isPending ? ' wh-target--contested wh-target--pending' : ''}`}
                      style={{
                        left: `calc(50% + ${t.dest.x * unit}px)`,
                        top: `calc(50% + ${t.dest.y * unit}px)`,
                        width: 0.68 * unit,
                        height: 0.68 * unit,
                      }}
                      onClick={(e) => {
                        e.stopPropagation()
                        onMove(t.move)
                      }}
                      aria-label="Move the selected marble here"
                    />
                  )
                })
              )}
            </>
          )}
        </div>

        {/* Legend */}
        <div className="wh-legend">
          {publicState.turn.playerOrder.map((pid) => {
            const isTurn = pid === currentPlayer(publicState.turn)
            const positions = publicState.positions[pid]
            const home = positions.filter((p) => p >= 52).length
            const base = positions.filter((p) => p === -1).length
            return (
              <div key={pid} className={`wh-seat-chip${isTurn ? ' wh-seat-chip--turn' : ''}`}>
                <span className="wh-seat-dot" style={{ background: seatColor(publicState, pid) }} />
                <span className="wh-seat-name">{names[pid] ?? pid}</span>
                <span className="wh-seat-stats">{home} home · {base} base</span>
                {isTurn && <span className="wh-turn-tag">turn</span>}
              </div>
            )
          })}
        </div>
      </div>

      {rulesOpen && <WahooRulesOverlay onClose={() => setRulesOpen(false)} />}
    </div>
  )
}
