import { SoundToggle } from './SoundToggle'
import { TurnSoundToggle } from './TurnSoundToggle'
import { Wordmark } from './Wordmark'

// enabled/turnSoundEnabled come from the CALLER's single useSound() instance
// (not a fresh one here) — otherwise this toggle and the screen's own play()
// calls would read two independently-initialized copies of the same cookie
// and drift out of sync the moment one of them changes.
export function TableHeader({
  gameLabel, gameColor, meta, onRules, onLeave, enabled, setEnabled, turnSoundEnabled, setTurnSoundEnabled,
}: {
  gameLabel: string
  gameColor: string
  meta: string
  onRules: () => void
  onLeave: () => void
  enabled: boolean
  setEnabled: (value: boolean) => void
  turnSoundEnabled: boolean
  setTurnSoundEnabled: (value: boolean) => void
}) {
  return (
    <div className="header-row">
      <div className="header-left">
        <Wordmark small onClick={onLeave} />
        <span style={{ fontWeight: 700, fontSize: 20, color: gameColor }}>{gameLabel}</span>
        <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--muted-text)' }}>{meta}</span>
      </div>
      <div className="header-actions">
        <TurnSoundToggle enabled={turnSoundEnabled} onToggle={() => setTurnSoundEnabled(!turnSoundEnabled)} />
        <SoundToggle enabled={enabled} onToggle={() => setEnabled(!enabled)} />
        <button type="button" className="btn pill-small" onClick={onRules}>Rules</button>
        <button type="button" className="btn btn-ghost" onClick={onLeave}>Leave</button>
      </div>
    </div>
  )
}
