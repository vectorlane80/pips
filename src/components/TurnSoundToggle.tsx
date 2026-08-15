export function TurnSoundToggle({ enabled, onToggle }: { enabled: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      className="btn btn-ghost"
      onClick={onToggle}
      aria-label={enabled ? 'Mute your-turn sound' : 'Unmute your-turn sound'}
      title={enabled ? "Your-turn sound on" : "Your-turn sound off"}
    >
      {enabled ? '🔔' : '🔕'}
    </button>
  )
}
