import { useEffect, useRef, useState } from 'react'
import type { Die } from '../types'

/** Flickers through random faces briefly whenever a genuinely new roll lands, then settles on the real values. */
export function useDiceAnimation(dice: Die[], rollSignal: string | number) {
  const [display, setDisplay] = useState<number[]>(dice.map((d) => d.val))
  const runId = useRef(0)

  useEffect(() => {
    if (dice.length === 0) {
      setDisplay([])
      return
    }
    const id = ++runId.current
    let frame = 0
    const total = 7
    const tick = () => {
      if (runId.current !== id) return
      if (frame < total) {
        // Held dice show their real (unchanging) value throughout — only dice that are
        // actually about to re-roll flicker through random faces.
        setDisplay(dice.map((d) => (d.sel ? d.val : 1 + Math.floor(Math.random() * 6))))
        frame++
        setTimeout(tick, 60)
      } else {
        setDisplay(dice.map((d) => d.val))
      }
    }
    tick()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rollSignal, dice.length])

  return display
}
