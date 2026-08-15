import { useEffect, useRef } from 'react'

/** Plays the turn-start cue exactly when the game hands the turn TO the local
 * player — never on mount, never for a bot's turn, and never in a solo-vs-bot
 * game (humanCount < 2, since there's nobody to be reminded it's their turn). */
export function useTurnStartSound(isMyTurn: boolean, humanCount: number, playTurnStart: () => void): void {
  const wasMyTurnRef = useRef(isMyTurn)

  useEffect(() => {
    if (!wasMyTurnRef.current && isMyTurn && humanCount >= 2) {
      playTurnStart()
    }
    wasMyTurnRef.current = isMyTurn
  }, [isMyTurn, humanCount, playTurnStart])
}
