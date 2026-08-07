import type { RoomState } from '../types'
import { TTT_MARKS } from '../games/ttt'
import { TableHeader } from '../components/TableHeader'

export function TttTable({
  room, localSeatId, onPlay, onOpenRules, onLeave,
}: {
  room: RoomState
  localSeatId: string | null
  onPlay: (cell: number) => void
  onOpenRules: () => void
  onLeave: () => void
}) {
  const t = room.ttt
  const activeSeat = room.seats[room.turnIdx]
  const isMyTurn = activeSeat?.id === localSeatId

  return (
    <div style={{ maxWidth: 1260, margin: '0 auto', padding: 'clamp(28px,6vw,48px) clamp(18px,5vw,48px) 72px' }}>
      <TableHeader gameLabel="Tic Tac Toe" gameColor="var(--amber)" meta={`${room.code} · first to three`} onRules={onOpenRules} onLeave={onLeave} />

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'clamp(18px,3vw,40px)' }}>
        <div style={{ flex: '1 1 420px' }}>
          <div className="card card-resting">
            <span className="chip" style={{ background: activeSeat?.color }}>
              {isMyTurn ? 'Your move' : `${activeSeat?.name}'s move`}
            </span>
            <div style={{ fontSize: 'clamp(22px,3.2vw,30px)', fontWeight: 700, margin: '10px 0 20px' }}>
              {isMyTurn ? 'Pick a square.' : `${activeSeat?.name} is thinking…`}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'clamp(10px,1.4vw,16px)', maxWidth: 400 }}>
              {t.board.map((cell, i) => {
                const isWin = t.winLine.includes(i)
                const owner = cell !== null ? room.seats[cell] : null
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => onPlay(i)}
                    disabled={!isMyTurn || cell !== null || t.over}
                    style={{
                      aspectRatio: '1', borderRadius: 22, border: '4px solid var(--ink)',
                      background: isWin ? 'var(--yellow)' : '#fff',
                      boxShadow: isWin ? '0 7px 0 var(--ink)' : '0 7px 0 var(--grey-border)',
                      fontSize: 'clamp(38px,6vw,58px)', fontWeight: 700,
                      color: isWin ? 'var(--ink)' : owner?.color ?? 'var(--ink)',
                      cursor: !isMyTurn || cell !== null ? 'default' : 'pointer',
                    }}
                  >
                    {cell !== null ? TTT_MARKS[cell] : ''}
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        <div style={{ flex: '1 1 230px', maxWidth: 330 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {room.seats.map((s) => {
              const isActive = s.id === activeSeat?.id
              return (
                <div
                  key={s.id}
                  style={{
                    border: '3px solid var(--ink)', borderRadius: 18, padding: '12px 16px',
                    background: isActive ? s.color : '#fff', color: isActive ? '#fff' : 'var(--body-text)',
                    boxShadow: isActive ? 'none' : '0 7px 0 var(--grey-border)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700 }}>
                    <span>{s.name}</span>
                    <span style={{ fontSize: 13, fontWeight: 500 }}>{isActive ? (s.id === localSeatId ? 'your move' : '') : ''}</span>
                  </div>
                  <div style={{ fontSize: 22, fontWeight: 700, marginTop: 4 }}>{t.wins[s.id] ?? 0}<span style={{ fontSize: 13, fontWeight: 500, marginLeft: 6 }}>first to 3</span></div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
