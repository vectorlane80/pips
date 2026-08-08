import { useSound } from '../hooks/useSound'
import { SoundToggle } from './SoundToggle'
import { Wordmark } from './Wordmark'

export function TableHeader({
  gameLabel, gameColor, meta, onRules, onLeave,
}: {
  gameLabel: string
  gameColor: string
  meta: string
  onRules: () => void
  onLeave: () => void
}) {
  const { enabled, setEnabled } = useSound()
  return (
    <div className="header-row">
      <div className="header-left">
        <Wordmark small onClick={onLeave} />
        <span style={{ fontWeight: 700, fontSize: 20, color: gameColor }}>{gameLabel}</span>
        <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--muted-text)' }}>{meta}</span>
      </div>
      <div className="header-actions">
        <SoundToggle enabled={enabled} onToggle={() => setEnabled(!enabled)} />
        <button type="button" className="btn pill-small" onClick={onRules}>Rules</button>
        <button type="button" className="btn btn-ghost" onClick={onLeave}>Leave</button>
      </div>
    </div>
  )
}
