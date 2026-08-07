import type { Game } from '../types'
import { GAME_COLOR, GAME_LABEL } from '../types'
import { RULES } from '../data/rules'

export function RulesOverlay({ game, onClose }: { game: Game; onClose: () => void }) {
  const rules = RULES[game]
  return (
    <div className="overlay-backdrop" onClick={onClose}>
      <div className="overlay-panel" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <h2 style={{ margin: 0, fontSize: 26, fontWeight: 700, color: GAME_COLOR[game] }}>
            {GAME_LABEL[game]} rules
          </h2>
          <button type="button" className="btn pill-small" onClick={onClose}>Close</button>
        </div>
        <p style={{ color: 'var(--body-text)', lineHeight: 1.5, marginTop: 14 }}>{rules.intro}</p>
        {rules.scoring.length > 0 && (
          <div style={{ marginTop: 16, borderRadius: 12, overflow: 'hidden', border: '1px solid var(--grey-border-3)' }}>
            {rules.scoring.map((row, i) => (
              <div
                key={row.label}
                style={{
                  display: 'flex', justifyContent: 'space-between', padding: '10px 14px',
                  background: i % 2 === 0 ? '#fff' : 'var(--surface-alt)', fontSize: 14, fontWeight: 500,
                }}
              >
                <span>{row.label}</span>
                <span style={{ fontWeight: 700 }}>{row.value}</span>
              </div>
            ))}
          </div>
        )}
        <ul style={{ marginTop: 16, paddingLeft: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {rules.bullets.map((b) => (
            <li key={b} style={{ display: 'flex', gap: 10, fontSize: 15, lineHeight: 1.5, color: 'var(--body-text)' }}>
              <span style={{ color: 'var(--coral)' }}>●</span>
              <span>{b}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
