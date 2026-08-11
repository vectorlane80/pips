import { useState } from 'react'
import type { ChessDifficulty } from '../board-games/chess/state'
import { ChessRulesOverlay } from './ChessRulesOverlay'
import { Wordmark } from '../components/Wordmark'
import './BattleshipTable.css'

const BRAND = '#0891b2'

const DIFFICULTIES: { id: ChessDifficulty; name: string; desc: string; disabled?: boolean }[] = [
  { id: 'easy', name: 'Easy', desc: 'Forgiving and a little random.' },
  { id: 'normal', name: 'Normal', desc: 'Thinks two moves ahead.' },
  { id: 'hard', name: 'Hard', desc: 'A real engine. (Coming soon — plays Normal for now.)', disabled: true },
]

export function ChessRoom({
  code, localName, notice, difficulty, onSetDifficulty, onAddHouseBot, onLeave,
}: {
  code: string
  localName: string
  notice?: string | null
  difficulty: ChessDifficulty
  onSetDifficulty: (d: ChessDifficulty) => void
  onAddHouseBot: () => void
  onLeave: () => void
}) {
  const [copied, setCopied] = useState(false)
  const [rulesOpen, setRulesOpen] = useState(false)

  function copyLink() {
    const url = `${location.origin}${location.pathname}?join=${code}`
    navigator.clipboard?.writeText(url).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }

  return (
    <div style={{ maxWidth: 1120, margin: '0 auto', padding: 'clamp(28px,6vw,48px) clamp(18px,5vw,48px) 72px' }}>
      <div className="header-row">
        <div className="header-left">
          <Wordmark small onClick={onLeave} />
          <span style={{ fontSize: 15, fontWeight: 500, color: 'var(--muted-text)' }}>Chess table</span>
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
              style={{ background: BRAND, color: '#fff', cursor: 'default' }}
            >
              Chess
            </span>
          </div>

          <div style={{ marginTop: 26, fontWeight: 600, fontSize: 15 }}>Difficulty</div>
          <div className="bs-variant-list">
            {DIFFICULTIES.map((v) => (
              <button
                key={v.id}
                type="button"
                disabled={v.disabled}
                className={`bs-variant-option${v.id === difficulty ? ' bs-variant-option--selected' : ''}`}
                onClick={() => onSetDifficulty(v.id)}
                style={v.disabled ? { opacity: 0.55, cursor: 'not-allowed' } : undefined}
              >
                <span className="bs-variant-name">{v.name}</span>
                <span className="bs-variant-desc">{v.desc}</span>
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 22 }}>
            <button type="button" className="btn btn-coral btn-lg" onClick={onAddHouseBot}>
              Play the house
            </button>
          </div>
        </div>

        <div style={{ flex: '1 1 320px', maxWidth: 460 }}>
          <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 10 }}>At the table</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, border: '4px solid var(--ink)', borderRadius: 20, padding: '12px 16px' }}>
              <span className="avatar" style={{ background: 'var(--green-text)' }}>{(localName[0] ?? '?').toUpperCase()}</span>
              <div>
                <div style={{ fontWeight: 700, fontSize: 18 }}>{localName} (you)</div>
                <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--muted-text)' }}>Host</div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, border: '4px solid var(--grey-border)', borderRadius: 20, padding: '12px 16px', color: 'var(--disabled-text)' }}>
              <span className="avatar" style={{ background: 'var(--grey-fill)', color: 'var(--disabled-text)' }}>?</span>
              <div>
                <div style={{ fontWeight: 700, fontSize: 18 }}>Waiting…</div>
                <div style={{ fontSize: 13, fontWeight: 500 }}>Open seat</div>
              </div>
            </div>
          </div>
          <p style={{ marginTop: 16, fontSize: 15, color: 'var(--muted-text)' }}>
            Waiting for someone to type the code, or add a house player.
          </p>
        </div>
      </div>

      {rulesOpen && <ChessRulesOverlay onClose={() => setRulesOpen(false)} />}
    </div>
  )
}
