import { useState } from 'react'
import type { BotDifficulty, Game, RoomState, Seat } from '../types'
import { GAME_COLOR, GAME_LABEL, GAME_MAX_SEATS } from '../types'
import { SeatAvatar } from '../components/SeatAvatar'
import { Wordmark } from '../components/Wordmark'

const GAMES: Game[] = ['farkle', 'yahtzee', 'ttt', 'hangman']
const DIFFICULTIES: BotDifficulty[] = ['easy', 'medium', 'hard']
const DIFFICULTY_LABEL: Record<BotDifficulty, string> = { easy: 'Easy', medium: 'Medium', hard: 'Hard' }

export function Room({
  room, isHost, onPickGame, onAddBot, onSetDifficulty, onStart, onLeave, onOpenRules,
}: {
  room: RoomState
  isHost: boolean
  onPickGame: (g: Game) => void
  onAddBot: () => void
  onSetDifficulty: (d: BotDifficulty) => void
  onStart: () => void
  onLeave: () => void
  onOpenRules: () => void
}) {
  const [copied, setCopied] = useState(false)
  const max = GAME_MAX_SEATS[room.game]
  const rows: (Seat | null)[] = [...room.seats]
  while (rows.length < 2) rows.push(null)

  function copyLink() {
    const url = `${location.origin}${location.pathname}?join=${room.code}`
    navigator.clipboard?.writeText(url).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }

  return (
    <div style={{ maxWidth: 1120, margin: '0 auto', padding: 'clamp(28px,6vw,48px) clamp(18px,5vw,48px) 72px' }}>
      <div className="header-row">
        <div className="header-left">
          <Wordmark small onClick={onLeave} />
          <span style={{ fontSize: 15, fontWeight: 500, color: 'var(--muted-text)' }}>{GAME_LABEL[room.game]} table</span>
        </div>
        <div className="header-actions">
          <button type="button" className="btn pill-small" onClick={onOpenRules}>Rules</button>
          <button type="button" className="btn btn-ghost" onClick={onLeave}>Leave</button>
        </div>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'clamp(18px,3vw,40px)' }}>
        <div style={{ flex: '1 1 380px', maxWidth: 460 }}>
          <div style={{ background: 'var(--yellow)', border: '4px solid var(--ink)', borderRadius: 28, boxShadow: '0 9px 0 var(--ink)', padding: 30 }}>
            <div style={{ fontWeight: 600, fontSize: 15 }}>Give them this code</div>
            <div style={{ fontSize: 'clamp(46px,9vw,80px)', fontWeight: 700, letterSpacing: '-0.02em' }}>{room.code}</div>
          </div>
          <button type="button" className="btn" style={{ width: '100%', marginTop: 14 }} onClick={copyLink}>
            {copied ? 'Copied!' : 'Copy invite link'}
          </button>

          <div style={{ marginTop: 26, fontWeight: 600, fontSize: 15 }}>Playing</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 10 }}>
            {GAMES.map((g) => (
              <button
                key={g}
                type="button"
                disabled={!isHost}
                onClick={() => onPickGame(g)}
                className="btn pill-small"
                style={{
                  background: room.game === g ? GAME_COLOR[g] : '#fff',
                  color: room.game === g ? '#fff' : 'var(--ink)',
                  cursor: isHost ? 'pointer' : 'default',
                }}
              >
                {GAME_LABEL[g]}
              </button>
            ))}
          </div>

          {isHost && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 22 }}>
              <button
                type="button"
                className="btn btn-coral btn-lg"
                onClick={() => { if (room.seats.length === 1) onAddBot(); onStart() }}
              >
                {room.seats.length === 1 ? 'Play the house' : 'Start the game'}
              </button>
              <button type="button" className="btn" disabled={room.seats.length >= max} onClick={onAddBot}>
                Add a house player
              </button>
              <div>
                <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--muted-text)', marginBottom: 6 }}>House player skill</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  {DIFFICULTIES.map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => onSetDifficulty(d)}
                      className="btn pill-small"
                      style={{
                        flex: 1,
                        background: room.botDifficulty === d ? 'var(--ink)' : '#fff',
                        color: room.botDifficulty === d ? '#fff' : 'var(--ink)',
                      }}
                    >
                      {DIFFICULTY_LABEL[d]}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        <div style={{ flex: '1 1 320px', maxWidth: 460 }}>
          <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 10 }}>At the table</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {rows.map((seat, i) => (
              seat ? (
                <div key={seat.id} style={{ display: 'flex', alignItems: 'center', gap: 14, border: '4px solid var(--ink)', borderRadius: 20, padding: '12px 16px' }}>
                  <SeatAvatar seat={seat} />
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 18 }}>{seat.name}{seat.isHost ? ' (you)' : ''}</div>
                    <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--muted-text)' }}>
                      {seat.isHost ? 'Host' : seat.bot ? 'House' : 'Guest'}
                    </div>
                  </div>
                </div>
              ) : (
                <div key={`empty-${i}`} style={{ display: 'flex', alignItems: 'center', gap: 14, border: '4px solid var(--grey-border)', borderRadius: 20, padding: '12px 16px', color: 'var(--disabled-text)' }}>
                  <span className="avatar" style={{ background: 'var(--grey-fill)', color: 'var(--disabled-text)' }}>?</span>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 18 }}>Waiting…</div>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>Open seat</div>
                  </div>
                </div>
              )
            ))}
          </div>
          <p style={{ marginTop: 16, fontSize: 15, color: 'var(--muted-text)' }}>
            {room.seats.length >= 2
              ? "Everyone's here — the host throws first."
              : 'Waiting for someone to type the code, or add a house player.'}
          </p>
        </div>
      </div>
    </div>
  )
}
