import { useCallback, useState } from 'react'
import diceRoll from '../assets/sounds/dice-roll.mp3'
import dieSelect from '../assets/sounds/die-select.mp3'
import markPlace from '../assets/sounds/mark-place.mp3'
import farkleBust from '../assets/sounds/farkle-bust.mp3'
import bankPoints from '../assets/sounds/bank-points.mp3'
import hotDice from '../assets/sounds/hot-dice.mp3'
import cardDraw from '../assets/sounds/card-draw.mp3'
import cardPlay from '../assets/sounds/card-play.mp3'
import shuffle from '../assets/sounds/shuffle.mp3'
import letterCorrect from '../assets/sounds/letter-correct.mp3'
import letterWrong from '../assets/sounds/letter-wrong.mp3'
import turnStart from '../assets/sounds/turn-start.mp3'
import roundWin from '../assets/sounds/round-win.mp3'
import gameWin from '../assets/sounds/game-win.mp3'
import error from '../assets/sounds/error.mp3'

export type SoundName =
  | 'dice-roll' | 'die-select' | 'mark-place' | 'farkle-bust' | 'bank-points'
  | 'hot-dice' | 'card-draw' | 'card-play' | 'shuffle' | 'letter-correct'
  | 'letter-wrong' | 'turn-start' | 'round-win' | 'game-win' | 'error'

const SOUND_FILES: Record<SoundName, string> = {
  'dice-roll': diceRoll,
  'die-select': dieSelect,
  'mark-place': markPlace,
  'farkle-bust': farkleBust,
  'bank-points': bankPoints,
  'hot-dice': hotDice,
  'card-draw': cardDraw,
  'card-play': cardPlay,
  'shuffle': shuffle,
  'letter-correct': letterCorrect,
  'letter-wrong': letterWrong,
  'turn-start': turnStart,
  'round-win': roundWin,
  'game-win': gameWin,
  'error': error,
}

const COOKIE_NAME = 'pips-sound'

function readSoundCookie(): boolean {
  if (typeof document === 'undefined') return true
  const match = document.cookie.split('; ').find((row) => row.startsWith(`${COOKIE_NAME}=`))
  if (!match) return true
  return match.split('=')[1] === 'on'
}

function writeSoundCookie(enabled: boolean): void {
  document.cookie = `${COOKIE_NAME}=${enabled ? 'on' : 'off'}; path=/; max-age=31536000; samesite=lax`
}

export function useSound() {
  const [enabled, setEnabledState] = useState<boolean>(() => readSoundCookie())

  const setEnabled = useCallback((value: boolean) => {
    writeSoundCookie(value)
    setEnabledState(value)
  }, [])

  const play = useCallback((name: SoundName) => {
    if (!enabled) return
    const audio = new Audio(SOUND_FILES[name])
    void audio.play().catch(() => {})
  }, [enabled])

  return { enabled, setEnabled, play }
}
