import type { RoomState } from '../types'
import { scoreSelection } from '../games/farkle'
import { Die } from '../components/Die'
import { TableHeader } from '../components/TableHeader'
import { useDiceAnimation } from '../hooks/useDiceAnimation'

export function FarkleTable({
  room, localSeatId, onRoll, onToggle, onBank, onEndTurn, onOpenRules, onLeave,
}: {
  room: RoomState
  localSeatId: string | null
  onRoll: () => void
  onToggle: (dieId: number) => void
  onBank: () => void
  onEndTurn: () => void
  onOpenRules: () => void
  onLeave: () => void
}) {
  const f = room.farkle
  const activeSeat = room.seats[room.turnIdx]
  const isMyTurn = activeSeat?.id === localSeatId
  const displayVals = useDiceAnimation(f.dice)

  const selected = f.dice.filter((d) => d.sel)
  const sel = selected.length > 0 ? scoreSelection(selected.map((d) => d.val)) : { valid: true, score: 0 }
  const onTable = f.turnScore + (sel.valid ? sel.score : 0)
  const canAct = isMyTurn && !f.farkle && sel.valid
  const canRoll = canAct && (f.dice.length === 0 || selected.length > 0)
  const canBank = canAct && onTable > 0 && (activeSeat && activeSeat.score > 0 ? true : onTable >= f.openingScore)

  const remaining = f.dice.length - selected.length
  let rollLabel = 'Roll six'
  if (f.farkle) rollLabel = 'End turn'
  else if (f.dice.length > 0) rollLabel = remaining === 0 && selected.length > 0 ? 'Hot dice — roll six!' : `Roll ${remaining} again`

  let hint = ''
  if (!isMyTurn) hint = f.farkle ? '' : `${activeSeat?.name} is thinking…`
  else if (f.farkle) hint = ''
  else if (selected.length === 0) hint = f.dice.length > 0 ? 'Tap a die to set it aside.' : ''
  else if (!sel.valid) hint = "One of those doesn't score."
  else if (activeSeat?.score === 0 && onTable < f.openingScore) hint = `${f.openingScore - onTable} more to get on the board.`
  else hint = `+${sel.score} selected`

  return (
    <div style={{ maxWidth: 1260, margin: '0 auto', padding: 'clamp(28px,6vw,48px) clamp(18px,5vw,48px) 72px' }}>
      <TableHeader
        gameLabel="Farkle"
        gameColor="var(--violet)"
        meta={`${room.code} · Round ${f.round} · to ${f.winningScore.toLocaleString()}`}
        onRules={onOpenRules}
        onLeave={onLeave}
      />

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'clamp(18px,3vw,40px)' }}>
        <div style={{ flex: '1 1 520px' }}>
          <div className={`card ${f.farkle ? 'card-farkled' : ''}`}>
            <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
              <div>
                <span className="chip" style={{ background: activeSeat?.color }}>
                  {isMyTurn ? 'Your throw' : `${activeSeat?.name}'s throw`}
                </span>
                <div style={{
                  fontSize: 'clamp(24px,3.4vw,36px)', fontWeight: 700, marginTop: 10,
                  color: f.farkle ? 'var(--coral)' : 'var(--ink)',
                }}
                >
                  {f.farkle ? 'Farkle!' : 'Keep what scores.'}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--muted-text)' }}>{f.farkle ? 'Lost' : 'On the table'}</div>
                <div style={{
                  fontSize: 'clamp(54px,8.5vw,94px)', fontWeight: 700, letterSpacing: '-0.03em',
                  color: f.farkle ? 'var(--coral)' : onTable > 0 ? 'var(--violet)' : '#c2c2d8',
                }}
                >
                  {f.farkle ? (f.lost > 0 ? f.lost.toLocaleString() : 'Farkle') : onTable.toLocaleString()}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 24, minHeight: 94 }}>
              {f.dice.length === 0 && (
                <span style={{ color: 'var(--faint-text)', alignSelf: 'center' }}>
                  {isMyTurn ? f.status : `${activeSeat?.name} is thinking…`}
                </span>
              )}
              {f.dice.map((d, i) => (
                <Die
                  key={d.id}
                  value={displayVals[i] ?? d.val}
                  selected={d.sel}
                  rotation={d.rot}
                  onClick={isMyTurn && !f.farkle ? () => onToggle(d.id) : undefined}
                />
              ))}
            </div>

            {f.kept.length > 0 && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 18 }}>
                {f.kept.map((v, i) => <Die key={i} value={v} setAside />)}
              </div>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', marginTop: 18 }}>
            <button type="button" className="btn btn-coral btn-lg" disabled={f.farkle ? !isMyTurn : !canRoll} onClick={f.farkle ? onEndTurn : onRoll}>
              {rollLabel}
            </button>
            <button type="button" className="btn btn-green btn-lg" disabled={!canBank} onClick={onBank}>
              Bank {onTable > 0 ? onTable.toLocaleString() : ''}
            </button>
            <span style={{ fontSize: 16, color: 'var(--muted-text)' }}>{hint}</span>
          </div>
        </div>

        <div style={{ flex: '1 1 230px', maxWidth: 330 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {room.seats.map((s) => {
              const isActive = s.id === activeSeat?.id
              let sub = ''
              if (isActive) sub = s.id === localSeatId ? 'your throw' : 'their throw'
              else if (s.score === 0) sub = 'not open yet'
              return (
                <div
                  key={s.id}
                  style={{
                    border: '3px solid var(--ink)', borderRadius: 18, padding: '12px 16px',
                    background: isActive ? s.color : '#fff',
                    color: isActive ? '#fff' : 'var(--body-text)',
                    boxShadow: isActive ? 'none' : '0 7px 0 var(--grey-border)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700 }}>
                    <span>{s.name}</span>
                    <span style={{ fontSize: 13, fontWeight: 500 }}>{sub}</span>
                  </div>
                  <div style={{ fontSize: 22, fontWeight: 700, marginTop: 4 }}>{s.score.toLocaleString()}</div>
                </div>
              )
            })}
          </div>

          {room.showLog && f.log.length > 0 && (
            <div style={{ marginTop: 20 }}>
              <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 8 }}>Turn by turn</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {[...f.log].reverse().map((entry, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
                    <span style={{ color: entry.color, fontWeight: 600 }}>{entry.who}</span>
                    <span style={{ color: entry.tone === 'farkle' ? 'var(--coral)' : 'var(--green-text)', fontWeight: 600 }}>
                      {entry.tone === 'farkle' ? `−${entry.amount.toLocaleString()}` : `+${entry.amount.toLocaleString()}`}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
