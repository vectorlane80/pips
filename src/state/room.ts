import type {
  Action, FarkleState, Game, HangmanState, RoomState, Seat, TttState, YahtzeeState, YCategory,
} from '../types'
import { GAME_MAX_SEATS, SEAT_PALETTE } from '../types'
import { hasAnyScore, rollDice as rollFarkleDice, scoreSelection } from '../games/farkle'
import { grandTotal, rollDice as rollYahtzeeDice, scoreCategory, upperTotal } from '../games/yahtzee'
import { checkWin, isDraw } from '../games/ttt'
import { isWordSolved, randomWord } from '../games/hangman'

const CODE_WORDS = [
  'BONE', 'DICE', 'CARD', 'GAME', 'PLAY', 'STAR', 'MOON', 'LEAF', 'WAVE', 'FOX',
  'BIRD', 'FROG', 'PLUM', 'MINT', 'SAGE', 'REEF', 'DUNE', 'PEAK', 'GLOW', 'SPARK',
]

export function generateCode(): string {
  const word = CODE_WORDS[Math.floor(Math.random() * CODE_WORDS.length)]
  const num = Math.floor(10 + Math.random() * 90)
  return `${word}-${num}`
}

export function makeSeat(id: string, name: string, bot: boolean, isHost: boolean, seatIdx: number): Seat {
  const initials = name
    .trim()
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase() || '?'
  return {
    id, name, bot, isHost,
    color: SEAT_PALETTE[seatIdx % SEAT_PALETTE.length],
    initials,
    score: 0, farkles: 0, best: 0,
  }
}

function initFarkle(): FarkleState {
  return {
    dice: [], kept: [], turnScore: 0, rolling: false, farkle: false, lost: 0,
    finalRound: false, finalTrigger: null, status: 'Six dice, ready.', round: 1, log: [],
    winningScore: 10000, openingScore: 500,
  }
}

function initYahtzee(seats: Seat[]): YahtzeeState {
  const cards: YahtzeeState['cards'] = {}
  seats.forEach((s) => { cards[s.id] = {} })
  return { dice: [], rollsLeft: 3, cards, round: 1, rolling: false, status: 'Your roll.', lastTurn: null }
}

function initTtt(seats: Seat[]): TttState {
  const wins: Record<string, number> = {}
  seats.forEach((s) => { wins[s.id] = 0 })
  return { board: Array(9).fill(null), starter: 0, winLine: [], over: false, roundOver: false, pendingWinnerId: null, status: '', wins }
}

function initHangman(seats: Seat[]): HangmanState {
  const wins: Record<string, number> = {}
  seats.forEach((s) => { wins[s.id] = 0 })
  return startHangmanRound({ word: '', guessed: [], wrong: [], phase: 'setting', guesserIdx: 1, over: false, pendingWinnerId: null, status: '', wins }, seats)
}

function startHangmanRound(base: HangmanState, seats: Seat[]): HangmanState {
  const setterIdx = base.guesserIdx === 0 ? 1 : 0
  const setter = seats[setterIdx]
  if (!setter || setter.bot) {
    return { ...base, word: randomWord(), guessed: [], wrong: [], phase: 'guessing', over: false, pendingWinnerId: null, status: `Guess ${seats[base.guesserIdx]?.name ?? "the"}'s word.` }
  }
  return { ...base, word: '', guessed: [], wrong: [], phase: 'setting', over: false, pendingWinnerId: null, status: `Give ${seats[base.guesserIdx]?.name ?? 'them'} a word to guess.` }
}

export function makeRoom(code: string, game: Game, hostName: string, hostId: string): RoomState {
  const seats = [makeSeat(hostId, hostName, false, true, 0)]
  return {
    screen: 'room', game, code, seats, turnIdx: 0, botPace: 1, botDifficulty: 'medium', showLog: true,
    farkle: initFarkle(), yahtzee: initYahtzee(seats), ttt: initTtt(seats), hangman: initHangman(seats),
    winnerId: null,
  }
}

function withNewSeats(state: RoomState, seats: Seat[]): RoomState {
  return { ...state, seats, yahtzee: { ...state.yahtzee, cards: reconcileCards(state.yahtzee.cards, seats) }, ttt: { ...state.ttt, wins: reconcileScores(state.ttt.wins, seats) }, hangman: { ...state.hangman, wins: reconcileScores(state.hangman.wins, seats) } }
}

function reconcileCards(cards: YahtzeeState['cards'], seats: Seat[]): YahtzeeState['cards'] {
  const next = { ...cards }
  seats.forEach((s) => { if (!next[s.id]) next[s.id] = {} })
  return next
}

function reconcileScores(scores: Record<string, number>, seats: Seat[]): Record<string, number> {
  const next = { ...scores }
  seats.forEach((s) => { if (next[s.id] === undefined) next[s.id] = 0 })
  return next
}

export function addSeat(state: RoomState, id: string, name: string, bot: boolean): RoomState {
  if (state.seats.length >= GAME_MAX_SEATS[state.game]) return state
  const seat = makeSeat(id, name, bot, false, state.seats.length)
  return withNewSeats(state, [...state.seats, seat])
}

export function removeSeat(state: RoomState, id: string): RoomState {
  return withNewSeats(state, state.seats.filter((s) => s.id !== id))
}

function nextBotName(seats: Seat[]): string {
  const names = ['Marguerite', 'Otis', 'Wren', 'Baxter', 'Iris', 'Cleo', 'Fenn', 'Nova']
  const used = new Set(seats.map((s) => s.name))
  return names.find((n) => !used.has(n)) ?? `House ${seats.length}`
}

function advanceTurn(seats: Seat[], turnIdx: number, round: number): { turnIdx: number; round: number } {
  const next = (turnIdx + 1) % seats.length
  return { turnIdx: next, round: next === 0 ? round + 1 : round }
}

export function applyAction(state: RoomState, action: Action, by: string): RoomState {
  switch (action.type) {
    case 'pickGame': {
      if (state.screen !== 'room') return state
      const max = GAME_MAX_SEATS[action.game]
      const seats = state.seats.length > max ? state.seats.slice(0, max) : state.seats
      return withNewSeats({ ...state, game: action.game }, seats)
    }
    case 'addBot': {
      if (state.seats.length >= GAME_MAX_SEATS[state.game]) return state
      return addSeat(state, `bot-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, nextBotName(state.seats), true)
    }
    case 'setBotDifficulty':
      return { ...state, botDifficulty: action.difficulty }
    case 'startGame':
      return startGame(state)
    case 'rematch':
      return startGame({ ...state, screen: 'room' })
    case 'farkleRoll':
      return farkleRoll(state, by)
    case 'farkleToggle':
      return farkleToggle(state, by, action.dieId)
    case 'farkleBank':
      return farkleBank(state, by)
    case 'farkleEndTurn':
      return farkleEndTurn(state, by)
    case 'yahtzeeRoll':
      return yahtzeeRoll(state, by)
    case 'yahtzeeToggleHold':
      return yahtzeeToggleHold(state, by, action.dieId)
    case 'yahtzeeScore':
      return yahtzeeScore(state, by, action.category)
    case 'tttPlay':
      return tttPlay(state, by, action.cell)
    case 'tttAdvanceRound':
      return tttAdvanceRound(state)
    case 'hangmanSetWord':
      return hangmanSetWord(state, by, action.word)
    case 'hangmanGuess':
      return hangmanGuess(state, by, action.letter)
    case 'hangmanAdvanceRound':
      return hangmanAdvanceRound(state)
    default:
      return state
  }
}

function startGame(state: RoomState): RoomState {
  const seats = state.seats
  let farkle = state.farkle
  let yahtzee = state.yahtzee
  let ttt = state.ttt
  let hangman = state.hangman
  if (state.game === 'farkle') farkle = { ...initFarkle(), winningScore: farkle.winningScore, openingScore: farkle.openingScore }
  if (state.game === 'yahtzee') yahtzee = initYahtzee(seats)
  if (state.game === 'ttt') ttt = { ...initTtt(seats), starter: 0 }
  if (state.game === 'hangman') hangman = initHangman(seats)
  return { ...state, screen: state.game, turnIdx: 0, farkle, yahtzee, ttt, hangman, winnerId: null }
}

// ---------- Farkle ----------

function isFarkleTurn(state: RoomState, by: string) {
  return state.seats[state.turnIdx]?.id === by
}

function farkleRoll(state: RoomState, by: string): RoomState {
  if (state.screen !== 'farkle' || !isFarkleTurn(state, by)) return state
  let f = state.farkle
  const selected = f.dice.filter((d) => d.sel)
  let turnScore = f.turnScore
  let kept = f.kept
  if (selected.length > 0) {
    const { valid, score } = scoreSelection(selected.map((d) => d.val))
    if (!valid) return state
    turnScore += score
    kept = [...kept, ...selected.map((d) => d.val)]
  } else if (f.dice.length > 0) {
    return state
  }
  let remaining = 6 - kept.length
  if (remaining === 0) { remaining = 6; kept = [] }
  const dice = rollFarkleDice(remaining)
  const scored = hasAnyScore(dice.map((d) => d.val))
  if (!scored) {
    const seat = state.seats.find((s) => s.id === by)!
    const seats = state.seats.map((s) => (s.id === by ? { ...s, farkles: s.farkles + 1 } : s))
    const log = [...f.log, { who: seat.name, color: seat.color, amount: turnScore, tone: 'farkle' as const }]
    return {
      ...state,
      seats,
      farkle: { ...f, dice, kept: [], turnScore: 0, farkle: true, lost: turnScore, status: 'Farkle!', log },
    }
  }
  return { ...state, farkle: { ...f, dice, kept, turnScore, farkle: false, status: 'Keep what scores.' } }
}

function farkleToggle(state: RoomState, by: string, dieId: number): RoomState {
  if (state.screen !== 'farkle' || !isFarkleTurn(state, by)) return state
  const f = state.farkle
  const dice = f.dice.map((d) => (d.id === dieId ? { ...d, sel: !d.sel } : d))
  return { ...state, farkle: { ...f, dice } }
}

function farkleBank(state: RoomState, by: string): RoomState {
  if (state.screen !== 'farkle' || !isFarkleTurn(state, by)) return state
  const f = state.farkle
  const selected = f.dice.filter((d) => d.sel)
  let turnScore = f.turnScore
  if (selected.length > 0) {
    const { valid, score } = scoreSelection(selected.map((d) => d.val))
    if (!valid) return state
    turnScore += score
  }
  const seat = state.seats.find((s) => s.id === by)!
  if (seat.score === 0 && turnScore < f.openingScore) return state
  if (turnScore <= 0) return state
  const newScore = seat.score + turnScore
  const seats = state.seats.map((s) => (s.id === by ? { ...s, score: newScore, best: Math.max(s.best, turnScore) } : s))
  const log = [...f.log, { who: seat.name, color: seat.color, amount: turnScore, tone: 'bank' as const }]
  let finalRound = f.finalRound
  let finalTrigger = f.finalTrigger
  if (!finalRound && newScore >= f.winningScore) { finalRound = true; finalTrigger = by }
  const { turnIdx, round } = advanceTurn(state.seats, state.turnIdx, f.round)
  if (finalRound && state.seats[turnIdx]?.id === finalTrigger) {
    const winnerId = [...seats].sort((a, b) => b.score - a.score)[0].id
    return { ...state, seats, screen: 'results', winnerId, farkle: { ...f, log, turnScore: 0, dice: [], kept: [] } }
  }
  return { ...state, seats, turnIdx, farkle: { ...f, log, turnScore: 0, dice: [], kept: [], farkle: false, finalRound, finalTrigger, round, status: 'Six dice, ready.' } }
}

function farkleEndTurn(state: RoomState, by: string): RoomState {
  if (state.screen !== 'farkle' || !isFarkleTurn(state, by)) return state
  const f = state.farkle
  const { turnIdx, round } = advanceTurn(state.seats, state.turnIdx, f.round)
  return { ...state, turnIdx, farkle: { ...f, farkle: false, dice: [], round, status: 'Six dice, ready.' } }
}

// ---------- Yahtzee ----------

function isYahtzeeTurn(state: RoomState, by: string) {
  return state.seats[state.turnIdx]?.id === by
}

function yahtzeeRoll(state: RoomState, by: string): RoomState {
  if (state.screen !== 'yahtzee' || !isYahtzeeTurn(state, by)) return state
  const y = state.yahtzee
  if (y.rollsLeft <= 0) return state
  const dice = y.dice.length === 0
    ? rollYahtzeeDice(5)
    : y.dice.map((d) => (d.sel ? d : { ...d, val: 1 + Math.floor(Math.random() * 6), rot: Math.random() * 10 - 5 }))
  return { ...state, yahtzee: { ...y, dice, rollsLeft: y.rollsLeft - 1, status: 'Hold dice, or score a box.' } }
}

function yahtzeeToggleHold(state: RoomState, by: string, dieId: number): RoomState {
  if (state.screen !== 'yahtzee' || !isYahtzeeTurn(state, by)) return state
  const y = state.yahtzee
  if (y.dice.length === 0) return state
  const dice = y.dice.map((d) => (d.id === dieId ? { ...d, sel: !d.sel } : d))
  return { ...state, yahtzee: { ...y, dice } }
}

function yahtzeeScore(state: RoomState, by: string, category: YCategory): RoomState {
  if (state.screen !== 'yahtzee' || !isYahtzeeTurn(state, by)) return state
  const y = state.yahtzee
  if (y.dice.length === 0) return state
  if (y.cards[by]?.[category] !== undefined) return state
  const vals = y.dice.map((d) => d.val)
  const points = scoreCategory(vals, category)
  const cards = { ...y.cards, [by]: { ...y.cards[by], [category]: points } }
  const seats = state.seats.map((s) => (s.id === by ? { ...s, score: grandTotal(cards[by]) } : s))
  const allDone = seats.every((s) => Object.keys(cards[s.id] ?? {}).length >= 13)
  if (allDone) {
    const winnerId = [...seats].sort((a, b) => b.score - a.score)[0].id
    return { ...state, seats, screen: 'results', winnerId, yahtzee: { ...y, cards } }
  }
  const { turnIdx, round } = advanceTurn(state.seats, state.turnIdx, y.round)
  const lastTurnSeat = state.seats.find((s) => s.id === by)!
  return {
    ...state, seats, turnIdx,
    yahtzee: { ...y, cards, dice: [], rollsLeft: 3, round, status: 'Your roll.', lastTurn: { name: lastTurnSeat.name, color: lastTurnSeat.color, category, points } },
  }
}

// ---------- Tic Tac Toe ----------

function tttPlay(state: RoomState, by: string, cell: number): RoomState {
  if (state.screen !== 'ttt') return state
  const t = state.ttt
  if (t.roundOver || t.board[cell] !== null) return state
  const seatIdx = state.seats.findIndex((s) => s.id === by)
  if (seatIdx !== state.turnIdx) return state
  const board = [...t.board]
  board[cell] = seatIdx
  const winLine = checkWin(board, seatIdx)
  const draw = !winLine && isDraw(board)
  if (winLine || draw) {
    const wins = { ...t.wins }
    if (winLine) wins[by] = (wins[by] ?? 0) + 1
    const seats = state.seats.map((s) => ({ ...s, score: wins[s.id] ?? 0 }))
    const matchOver = Object.values(wins).some((w) => w >= 3)
    const pendingWinnerId = matchOver ? Object.entries(wins).sort((a, b) => b[1] - a[1])[0][0] : null
    return {
      ...state, seats,
      ttt: { ...t, board, winLine: winLine ?? [], over: true, roundOver: true, pendingWinnerId, wins },
    }
  }
  const turnIdx = (state.turnIdx + 1) % state.seats.length
  return { ...state, ttt: { ...t, board }, turnIdx }
}

function tttAdvanceRound(state: RoomState): RoomState {
  if (state.screen !== 'ttt') return state
  const t = state.ttt
  if (!t.roundOver) return state
  if (t.pendingWinnerId) {
    return { ...state, screen: 'results', winnerId: t.pendingWinnerId }
  }
  const nextStarter = (t.starter + 1) % state.seats.length
  return {
    ...state, turnIdx: nextStarter,
    ttt: { ...t, board: Array(9).fill(null), winLine: [], over: false, roundOver: false, pendingWinnerId: null, starter: nextStarter, status: '' },
  }
}

// ---------- Hangman ----------

function hangmanSetWord(state: RoomState, by: string, word: string): RoomState {
  if (state.screen !== 'hangman') return state
  const h = state.hangman
  const setterIdx = h.guesserIdx === 0 ? 1 : 0
  if (state.seats[setterIdx]?.id !== by) return state
  const clean = word.trim().toUpperCase().replace(/[^A-Z ]/g, '').replace(/\s+/g, ' ').trim()
  if (clean.replace(/ /g, '').length < 3) return state
  return { ...state, hangman: { ...h, word: clean, phase: 'guessing', guessed: [], wrong: [], status: `Guess ${state.seats[h.guesserIdx]?.name}'s word.` } }
}

function hangmanGuess(state: RoomState, by: string, letter: string): RoomState {
  if (state.screen !== 'hangman') return state
  const h = state.hangman
  if (h.phase !== 'guessing') return state
  if (state.seats[h.guesserIdx]?.id !== by) return state
  const L = letter.toUpperCase()
  if (h.guessed.includes(L)) return state
  const guessed = [...h.guessed, L]
  const wrong = h.word.includes(L) ? h.wrong : [...h.wrong, L]
  const solved = isWordSolved(h.word, guessed)
  const lost = wrong.length >= 6
  if (solved || lost) {
    const wins = { ...h.wins }
    const guesser = state.seats[h.guesserIdx]
    if (solved && guesser) wins[guesser.id] = (wins[guesser.id] ?? 0) + 1
    const seats = state.seats.map((s) => ({ ...s, score: wins[s.id] ?? 0 }))
    const matchOver = Object.values(wins).some((w) => w >= 2)
    const pendingWinnerId = matchOver ? Object.entries(wins).sort((a, b) => b[1] - a[1])[0][0] : null
    const status = solved ? `${guesser?.name ?? 'They'} solved it!` : `Out of guesses — it was "${h.word}".`
    return {
      ...state, seats,
      hangman: { ...h, guessed, wrong, over: true, phase: 'roundOver', pendingWinnerId, status, wins },
    }
  }
  return { ...state, hangman: { ...h, guessed, wrong } }
}

function hangmanAdvanceRound(state: RoomState): RoomState {
  if (state.screen !== 'hangman') return state
  const h = state.hangman
  if (h.phase !== 'roundOver') return state
  if (h.pendingWinnerId) {
    return { ...state, screen: 'results', winnerId: h.pendingWinnerId }
  }
  const nextGuesser = h.guesserIdx === 0 ? 1 : 0
  return { ...state, hangman: startHangmanRound({ ...h, guesserIdx: nextGuesser }, state.seats) }
}

export function seatUpperBonusText(cards: YahtzeeState['cards'], seatId: string): string {
  const total = upperTotal(cards[seatId] ?? {})
  return total >= 63 ? '35' : `${total}/63`
}

export { advanceTurn }
