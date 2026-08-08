import type { RoomState, YCategory } from '../types'
import { Y_CATEGORIES, Y_LABEL, Y_SUBLABEL, scoreCategory, upperTotal } from '../games/yahtzee'
import { Die } from '../components/Die'
import { TableHeader } from '../components/TableHeader'
import { useDiceAnimation } from '../hooks/useDiceAnimation'

export function YahtzeeTable({
  room, localSeatId, onRoll, onToggleHold, onScore, onOpenRules, onLeave,
}: {
  room: RoomState
  localSeatId: string | null
  onRoll: () => void
  onToggleHold: (dieId: number) => void
  onScore: (category: YCategory) => void
  onOpenRules: () => void
  onLeave: () => void
}) {
  const y = room.yahtzee
  const activeSeat = room.seats[room.turnIdx]
  const isMyTurn = activeSeat?.id === localSeatId
  const displayVals = useDiceAnimation(y.dice)
  const vals = y.dice.map((d) => d.val)

  const rollLabel = y.dice.length === 0 ? 'Roll five' : y.rollsLeft > 0 ? `Roll again (${y.rollsLeft} left)` : 'No rolls left'
  const canRoll = isMyTurn && y.rollsLeft > 0

  return (
    <div style={{ maxWidth: 1260, margin: '0 auto', padding: 'clamp(28px,6vw,48px) clamp(18px,5vw,48px) 72px' }}>
      <TableHeader
        gameLabel="Yahtzee"
        gameColor="var(--teal)"
        meta={`${room.code} · Turn ${y.round} of 13`}
        onRules={onOpenRules}
        onLeave={onLeave}
      />

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'clamp(18px,3vw,40px)' }}>
        <div style={{ flex: '1 1 460px' }}>
          <div className="card card-resting">
            <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
              <div>
                <span className="chip" style={{ background: activeSeat?.color }}>
                  {isMyTurn ? 'Your throw' : `${activeSeat?.name}'s throw`}
                </span>
                <div style={{ fontSize: 'clamp(22px,3.2vw,30px)', fontWeight: 700, marginTop: 10 }}>
                  {isMyTurn ? y.status : `${activeSeat?.name} is thinking…`}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--muted-text)', marginBottom: 6 }}>Rolls left</div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {[0, 1, 2].map((i) => (
                    <span
                      key={i}
                      style={{
                        width: 22, height: 22, borderRadius: '50%',
                        background: i < y.rollsLeft ? 'var(--yellow)' : 'var(--grey-fill)',
                        border: '2px solid var(--ink)',
                      }}
                    />
                  ))}
                </div>
              </div>
            </div>

            {y.dice.length === 0 && y.lastTurn !== null && (
              <div style={{
                marginTop: 16, padding: '10px 16px', background: 'var(--surface-alt)', borderRadius: 12,
                fontSize: 14, fontWeight: 500, border: '3px solid var(--grey-fill)',
              }}>
                <span style={{ color: y.lastTurn.color, fontWeight: 700 }}>{y.lastTurn.name}</span>
                {' scored '}
                <strong>{y.lastTurn.points}</strong>
                {' on '}
                <strong>{Y_LABEL[y.lastTurn.category]}</strong>.
              </div>
            )}

            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: y.dice.length === 0 && y.lastTurn !== null ? 12 : 24, minHeight: 96 }}>
              {y.dice.length === 0 && <span style={{ color: 'var(--faint-text)', alignSelf: 'center' }}>Five dice, ready.</span>}
              {y.dice.length > 0 && (() => {
                const displayMap = new Map(y.dice.map((d, i) => [d.id, displayVals[i] ?? d.val]))
                const heldDice = y.dice.filter((d) => d.sel)
                const unheldDice = y.dice.filter((d) => !d.sel)
                return (
                  <>
                    {heldDice.map((d) => (
                      <Die
                        key={d.id}
                        value={displayMap.get(d.id) ?? d.val}
                        selected={d.sel}
                        rotation={d.rot}
                        onClick={isMyTurn ? () => onToggleHold(d.id) : undefined}
                      />
                    ))}
                    {heldDice.length > 0 && unheldDice.length > 0 && (
                      <div style={{ width: 3, background: 'var(--grey-fill)', borderRadius: 2, alignSelf: 'stretch', margin: '6px 4px' }} />
                    )}
                    {unheldDice.map((d) => (
                      <Die
                        key={d.id}
                        value={displayMap.get(d.id) ?? d.val}
                        selected={d.sel}
                        rotation={d.rot}
                        onClick={isMyTurn ? () => onToggleHold(d.id) : undefined}
                      />
                    ))}
                  </>
                )
              })()}
            </div>
            {y.dice.length > 0 && (
              <p style={{ fontSize: 14, color: 'var(--muted-text)', marginTop: 12 }}>
                {y.rollsLeft > 0 ? 'Tap a die to hold it for the next roll.' : 'No rolls left — pick a box on the card.'}
              </p>
            )}
          </div>

          <button type="button" className="btn btn-teal btn-lg" style={{ marginTop: 18 }} disabled={!canRoll} onClick={onRoll}>
            {rollLabel}
          </button>
        </div>

        <div style={{ flex: '1 1 340px', maxWidth: 620 }}>
          <div style={{ background: '#fff', border: '4px solid var(--ink)', borderRadius: 24, boxShadow: '0 9px 0 var(--grey-border)', padding: '14px 16px', overflowX: 'auto' }}>
            <div style={{ display: 'grid', gridTemplateColumns: `1fr repeat(${room.seats.length}, 74px)`, gap: 6, alignItems: 'center' }}>
              <div style={{ fontWeight: 700, fontSize: 15 }}>Scorecard</div>
              {room.seats.map((s) => (
                <div key={s.id} style={{ textAlign: 'center', fontWeight: 700, fontSize: 13, color: s.color }}>{s.name}</div>
              ))}

              {Y_CATEGORIES.map((cat, ci) => (
                <YRow key={cat} cat={cat} room={room} activeSeat={activeSeat} isMyTurn={isMyTurn} vals={vals} onScore={onScore} injectBonus={ci === 6} />
              ))}

              <div style={{ fontWeight: 700, fontSize: 15, marginTop: 4 }}>Total</div>
              {room.seats.map((s) => (
                <div key={s.id} style={{ textAlign: 'center', fontWeight: 700, fontSize: 16, color: s.color, marginTop: 4 }}>{s.score}</div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function YRow({
  cat, room, activeSeat, isMyTurn, vals, onScore, injectBonus,
}: {
  cat: YCategory
  room: RoomState
  activeSeat: RoomState['seats'][number]
  isMyTurn: boolean
  vals: number[]
  onScore: (c: YCategory) => void
  injectBonus: boolean
}) {
  const y = room.yahtzee
  return (
    <>
      {injectBonus && (
        <>
          <div style={{ fontSize: 13, color: 'var(--faint-text)' }}>Upper bonus <span style={{ display: 'block', fontSize: 11 }}>35 at 63 or more</span></div>
          {room.seats.map((s) => {
            const upper = upperTotal(y.cards[s.id] ?? {})
            return (
              <div key={s.id} style={{ textAlign: 'center', fontSize: 13, fontWeight: 600, color: upper >= 63 ? 'var(--green-text)' : 'var(--grey-border)' }}>
                {upper >= 63 ? '35' : `${upper}/63`}
              </div>
            )
          })}
        </>
      )}
      <div>
        <div style={{ fontSize: 15, fontWeight: 500 }}>{Y_LABEL[cat]}</div>
        <div style={{ fontSize: 12, color: 'var(--faint-text)' }}>{Y_SUBLABEL[cat]}</div>
      </div>
      {room.seats.map((s) => {
        const filled = y.cards[s.id]?.[cat]
        if (filled !== undefined) {
          return (
            <div key={s.id} style={{ height: 38, background: 'var(--surface-alt)', color: 'var(--body-text)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600 }}>
              {filled}
            </div>
          )
        }
        const live = s.id === activeSeat?.id && isMyTurn && y.dice.length > 0
        if (live) {
          const val = scoreCategory(vals, cat)
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => onScore(cat)}
              style={{
                height: 38, borderRadius: 8, border: '3px solid var(--ink)', fontWeight: 700, cursor: 'pointer',
                background: val > 0 ? 'var(--yellow)' : '#fff', boxShadow: '0 3px 0 var(--ink)',
              }}
            >
              {val}
            </button>
          )
        }
        return (
          <div key={s.id} style={{ height: 38, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#c2c2d8' }}>·</div>
        )
      })}
    </>
  )
}
