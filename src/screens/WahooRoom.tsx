import { useState } from 'react'
import { WahooRulesOverlay } from './WahooRulesOverlay'
import { Wordmark } from '../components/Wordmark'

export interface WahooRoomProps {
  code: string
  localName: string
  isHost: boolean
  seats: { name: string; isBot: boolean; isHost: boolean }[]  // host first, join order
  notice?: string | null
  onAddHouseBot: () => void      // host-only
  onStartGame: () => void        // host-only
  onLeave: () => void
}

const MAX_SEATS = 4

export function WahooRoom({
  code,
  localName,
  isHost,
  seats,
  notice,
  onAddHouseBot,
  onStartGame,
  onLeave,
}: WahooRoomProps) {
  const [copied, setCopied] = useState(false)
  const [rulesOpen, setRulesOpen] = useState(false)

  function copyLink() {
    const url = `${location.origin}${location.pathname}?join=${code}`
    navigator.clipboard?.writeText(url).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }

  const hostName = seats.find((s) => s.isHost)?.name ?? 'the host'
  const slots = Array.from({ length: MAX_SEATS }, (_, i) => seats[i] ?? null)

  return (
    <div style={{ maxWidth: 1120, margin: '0 auto', padding: 'clamp(28px,6vw,48px) clamp(18px,5vw,48px) 72px' }}>
      <div className="header-row">
        <div className="header-left">
          <Wordmark small onClick={onLeave} />
          <span style={{ fontSize: 15, fontWeight: 500, color: 'var(--muted-text)' }}>Wahoo table</span>
        </div>
        <div className="header-actions">
          <button type="button" className="btn pill-small" onClick={() => setRulesOpen(true)}>Rules</button>
          <button type="button" className="btn btn-ghost" onClick={onLeave}>Leave</button>
        </div>
      </div>

      {notice && (
        <div style={{
          textAlign: 'center',
          background: 'var(--coral)',
          color: '#fff',
          fontWeight: 700,
          fontSize: 'clamp(14px, 1.8vw, 17px)',
          padding: '10px 22px',
          borderRadius: 999,
          border: '3px solid var(--ink)',
          boxShadow: '0 5px 0 var(--ink)',
          marginBottom: 'clamp(10px, 2vw, 18px)',
        }}>
          {notice}
        </div>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'clamp(18px,3vw,40px)' }}>
        <div style={{ flex: '1 1 380px', maxWidth: 460 }}>
          <div style={{ background: 'var(--yellow)', border: '4px solid var(--ink)', borderRadius: 28, boxShadow: '0 9px 0 var(--ink)', padding: 30 }}>
            <div style={{ fontWeight: 600, fontSize: 15 }}>Give them this code</div>
            <div style={{ fontSize: 'clamp(46px,9vw,80px)', fontWeight: 700, letterSpacing: '-0.02em' }}>{code}</div>
          </div>
          <button type="button" className="btn" style={{ width: '100%', marginTop: 14 }} onClick={copyLink}>
            {copied ? 'Copied!' : 'Copy invite link'}
          </button>

          <div style={{ marginTop: 26, fontWeight: 600, fontSize: 15 }}>Playing</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 10 }}>
            <span
              className="btn pill-small"
              style={{ background: '#9333ea', color: '#fff', cursor: 'default' }}
            >
              Wahoo
            </span>
          </div>

          {isHost ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 22 }}>
              <button type="button" className="btn btn-lg" onClick={onAddHouseBot} disabled={seats.length >= MAX_SEATS}>
                Add house bot
              </button>
              <button type="button" className="btn btn-coral btn-lg" onClick={onStartGame} disabled={seats.length < 2}>
                Start game
              </button>
            </div>
          ) : (
            <p style={{ marginTop: 22, fontSize: 15, color: 'var(--muted-text)' }}>
              Waiting for {hostName} to start…
            </p>
          )}
        </div>

        <div style={{ flex: '1 1 320px', maxWidth: 460 }}>
          <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 10 }}>At the table</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {slots.map((seat, i) =>
              seat === null ? (
                <div
                  key={`empty-${i}`}
                  style={{ display: 'flex', alignItems: 'center', gap: 14, border: '4px solid var(--grey-border)', borderRadius: 20, padding: '12px 16px', color: 'var(--disabled-text)' }}
                >
                  <span className="avatar" style={{ background: 'var(--grey-fill)', color: 'var(--disabled-text)' }}>?</span>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 18 }}>Open seat</div>
                  </div>
                </div>
              ) : (
                <div
                  key={`seat-${i}`}
                  style={{ display: 'flex', alignItems: 'center', gap: 14, border: '4px solid var(--ink)', borderRadius: 20, padding: '12px 16px' }}
                >
                  <span className="avatar" style={{ background: '#9333ea' }}>{(seat.name[0] ?? '?').toUpperCase()}</span>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 18 }}>
                      {seat.name}{seat.name === localName ? ' (you)' : ''}
                    </div>
                    <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                      {seat.isHost && <span className="chip" style={{ background: '#9333ea', color: '#fff' }}>Host</span>}
                      {seat.isBot && <span className="chip" style={{ background: 'var(--slate-pip)', color: '#fff' }}>House bot</span>}
                    </div>
                  </div>
                </div>
              ),
            )}
          </div>
          <p style={{ marginTop: 16, fontSize: 15, color: 'var(--muted-text)' }}>
            Waiting for friends to type the code, or add a house bot.
          </p>
        </div>
      </div>

      {rulesOpen && <WahooRulesOverlay onClose={() => setRulesOpen(false)} />}
    </div>
  )
}
