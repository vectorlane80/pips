import type { JSX } from 'react'
import './ScoreHeader.css'

export interface ScoreHeaderProps {
  youScore: number
  youColor: string
  opponentName: string
  opponentScore: number
  opponentColor: string
  hint: string
}

export function ScoreHeader({
  youScore,
  youColor,
  opponentName,
  opponentScore,
  opponentColor,
  hint,
}: ScoreHeaderProps): JSX.Element {
  return (
    <div className="score-header">
      <span className="score-header-pill">
        <span className="score-header-dot" style={{ background: youColor }} />
        You {youScore}
      </span>
      <span className="score-header-pill">
        <span className="score-header-dot" style={{ background: opponentColor }} />
        {opponentName} {opponentScore}
      </span>
      <span className="score-header-hint">{hint}</span>
    </div>
  )
}
