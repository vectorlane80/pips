import type { Seat } from '../types'

export function SeatAvatar({ seat }: { seat: Seat }) {
  return (
    <span className="avatar" style={{ background: seat.color }}>
      {seat.initials}
    </span>
  )
}
