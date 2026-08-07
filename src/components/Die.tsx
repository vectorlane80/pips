const POS: Record<number, [number, number][]> = {
  1: [[50, 50]],
  2: [[25, 25], [75, 75]],
  3: [[25, 25], [50, 50], [75, 75]],
  4: [[25, 25], [75, 25], [25, 75], [75, 75]],
  5: [[25, 25], [75, 25], [50, 50], [25, 75], [75, 75]],
  6: [[25, 25], [75, 25], [25, 50], [75, 50], [25, 75], [75, 75]],
}

export function Die({
  value, selected, setAside, rotation = 0, onClick,
}: {
  value: number
  selected?: boolean
  setAside?: boolean
  rotation?: number
  onClick?: () => void
}) {
  const cls = ['die', selected && 'die-selected', setAside && 'die-setaside'].filter(Boolean).join(' ')
  return (
    <button
      type="button"
      className={cls}
      style={{ transform: `rotate(${rotation}deg)${selected ? ' translateY(-9px)' : ''}` }}
      onClick={onClick}
      disabled={!onClick}
      aria-label={`Die showing ${value}`}
    >
      {(POS[value] ?? []).map(([left, top], i) => (
        <span key={i} className="die-pip" style={{ left: `${left}%`, top: `${top}%` }} />
      ))}
    </button>
  )
}
