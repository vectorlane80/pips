export function SoundToggle({ enabled, onToggle }: { enabled: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      className="btn btn-ghost"
      onClick={onToggle}
      aria-label={enabled ? 'Mute sound effects' : 'Unmute sound effects'}
      title={enabled ? 'Sound on' : 'Sound off'}
    >
      {enabled ? '🔊' : '🔇'}
    </button>
  )
}
