import { useEffect, useMemo, useRef, useState } from 'react'
import type { Action, Game, RoomState } from './types'
import { addSeat, applyAction, generateCode, makeRoom, removeSeat } from './state/room'
import { randomBotName } from './data/botNames'
import { createHost, joinHost, peerIdForCode, type GuestHandle, type HostHandle } from './net/peer'
import { Landing } from './screens/Landing'
import { Room } from './screens/Room'
import { Results } from './screens/Results'
import { FarkleTable } from './screens/FarkleTable'
import { YahtzeeTable } from './screens/YahtzeeTable'
import { TttTable } from './screens/TttTable'
import { HangmanTable } from './screens/HangmanTable'
import { RulesOverlay } from './components/RulesOverlay'
import { decideFarkleBot } from './games/farkle'
import { decideYahtzeeCategory, decideYahtzeeHold } from './games/yahtzee'
import { decideTttMove } from './games/ttt'
import { decideHangmanLetter } from './games/hangman'

// ---- Rummy (separate parallel session, per CHARTER.md resolution #7) ----
import { createRummyGame, type RummySession, type RummyPublicState, type RummyPrivateState, type RummyAction } from './card-games/rummy/state'
import { applyRummyAction, runRummyBotTurn } from './card-games/rummy/rules'
import { rummyBotStrategy } from './card-games/rummy/bot'
import { deriveSnapshot, shouldAcceptUpdate } from './card-engine/sync'
import { currentPlayer } from './card-engine/turn-engine'
import { RummyTable } from './screens/RummyTable'
import { RummyResults } from './screens/RummyResults'
import { RummyRoom } from './screens/RummyRoom'

// ---- Phase 10 (separate parallel session, per CHARTER.md resolution #7) ----
import { createPhase10Game, type Phase10Session, type Phase10PublicState, type Phase10PrivateState, type Phase10Action } from './card-games/phase10/state'
import { applyPhase10Action, runPhase10BotTurn } from './card-games/phase10/rules'
import { phase10BotStrategy } from './card-games/phase10/bot'
import { Phase10Table } from './screens/Phase10Table'
import { Phase10Results } from './screens/Phase10Results'
import { Phase10Room } from './screens/Phase10Room'

type RummyView = { revision: number; publicState: RummyPublicState; privateState: RummyPrivateState; opponentName: string }
type Phase10View = { revision: number; publicState: Phase10PublicState; privateState: Phase10PrivateState; opponentName: string }

const BASE_MS = 900
const ROUND_PAUSE_MS = 4000

function wait(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms))
}

export default function App() {
  const [name, setName] = useState('')
  const [joinCodeInput, setJoinCodeInput] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [room, setRoom] = useState<RoomState | null>(null)
  const [role, setRole] = useState<'host' | 'guest' | null>(null)
  const [localSeatId, setLocalSeatId] = useState<string | null>(null)
  const [rulesOpen, setRulesOpen] = useState(false)

  // ---- Rummy ----
  const [rummyRole, setRummyRole] = useState<'host' | 'guest' | null>(null)
  const [rummyCode, setRummyCode] = useState('')
  const [rummyLocalPlayerId, setRummyLocalPlayerId] = useState<string | null>(null)
  const [rummyOpponentId, setRummyOpponentId] = useState<string | null>(null)
  const [rummyOpponentName, setRummyOpponentName] = useState('')
  const [rummyView, setRummyView] = useState<RummyView | null>(null)
  const [rummyConnection, setRummyConnection] = useState<'connected' | 'disconnected'>('connected')
  const [rummyWaiting, setRummyWaiting] = useState(false)

  // ---- Phase 10 ----
  const [phase10Role, setPhase10Role] = useState<'host' | 'guest' | null>(null)
  const [phase10Code, setPhase10Code] = useState('')
  const [phase10LocalPlayerId, setPhase10LocalPlayerId] = useState<string | null>(null)
  const [phase10OpponentId, setPhase10OpponentId] = useState<string | null>(null)
  const [phase10OpponentName, setPhase10OpponentName] = useState('')
  const [phase10View, setPhase10View] = useState<Phase10View | null>(null)
  const [phase10Connection, setPhase10Connection] = useState<'connected' | 'disconnected'>('connected')
  const [phase10Waiting, setPhase10Waiting] = useState(false)

  const roomRef = useRef<RoomState | null>(null)
  const hostRef = useRef<HostHandle<RoomState> | null>(null)
  const guestRef = useRef<GuestHandle<Action> | null>(null)
  const botBusyRef = useRef(false)
  const rummySessionRef = useRef<RummySession | null>(null)
  const rummyHostRef = useRef<HostHandle<RummyView> | null>(null)
  const rummyGuestRef = useRef<GuestHandle<RummyAction> | null>(null)
  const rummyBotBusyRef = useRef(false)
  const rummyLocalPlayerIdRef = useRef<string | null>(null)
  const rummyOpponentIdRef = useRef<string | null>(null)
  const rummyOpponentNameRef = useRef('')
  const phase10SessionRef = useRef<Phase10Session | null>(null)
  const phase10HostRef = useRef<HostHandle<Phase10View> | null>(null)
  const phase10GuestRef = useRef<GuestHandle<Phase10Action> | null>(null)
  const phase10BotBusyRef = useRef(false)
  const phase10LocalPlayerIdRef = useRef<string | null>(null)
  const phase10OpponentIdRef = useRef<string | null>(null)
  const phase10OpponentNameRef = useRef('')

  useEffect(() => {
    roomRef.current = room
  }, [room])

  useEffect(() => () => {
    hostRef.current?.destroy()
    guestRef.current?.destroy()
    rummyHostRef.current?.destroy()
    rummyGuestRef.current?.destroy()
    phase10HostRef.current?.destroy()
    phase10GuestRef.current?.destroy()
  }, [])

  useEffect(() => {
    const join = new URLSearchParams(location.search).get('join')
    if (join) setJoinCodeInput(join.toUpperCase())
  }, [])

  function hostApply(action: Action, by: string): RoomState | null {
    if (!roomRef.current) return null
    const next = applyAction(roomRef.current, action, by)
    roomRef.current = next
    setRoom(next)
    hostRef.current?.broadcast(next)
    return next
  }

  function dispatch(action: Action) {
    if (role === 'host' && localSeatId) hostApply(action, localSeatId)
    else if (role === 'guest') guestRef.current?.sendAction(action)
  }

  function startHost(game: Game) {
    const code = generateCode()
    const hostId = peerIdForCode(code)
    const initial = makeRoom(code, game, name.trim(), hostId)
    roomRef.current = initial
    setRoom(initial)
    setRole('host')
    setLocalSeatId(hostId)
    setError(null)
    hostRef.current = createHost<RoomState, Action>(code, {
      onJoin(guestId, guestName) {
        const next = addSeat(roomRef.current!, guestId, guestName, false)
        roomRef.current = next
        setRoom(next)
        hostRef.current?.broadcast(next)
      },
      onAction(guestId, action) {
        hostApply(action, guestId)
      },
      onLeave(guestId) {
        const prev = roomRef.current!
        let next = removeSeat(prev, guestId)
        if (next.turnIdx >= next.seats.length) next = { ...next, turnIdx: 0 }
        roomRef.current = next
        setRoom(next)
        hostRef.current?.broadcast(next)
      },
      onError(message) {
        setError(message)
      },
    })
  }

  function startGuest(code: string) {
    if (!code) return
    setError(null)
    const handle = joinHost<RoomState, Action>(code, name.trim(), {
      onState(state) {
        roomRef.current = state
        setRoom(state)
      },
      onError() {
        setError('Could not reach that room. Check the code and try again.')
      },
      onDisconnected() {
        setError('Lost connection to the host.')
      },
    })
    guestRef.current = handle
    setRole('guest')
    handle.peerId.then((id) => setLocalSeatId(id)).catch(() => {})
  }

  function resetToEntry() {
    hostRef.current?.destroy()
    hostRef.current = null
    guestRef.current?.destroy()
    guestRef.current = null
    roomRef.current = null
    setRoom(null)
    setRole(null)
    setLocalSeatId(null)
    setRulesOpen(false)
    // Rummy
    rummyHostRef.current?.destroy()
    rummyHostRef.current = null
    rummyGuestRef.current?.destroy()
    rummyGuestRef.current = null
    rummySessionRef.current = null
    setRummyRole(null)
    setRummyCode('')
    setRummyLocalPlayerId(null)
    rummyLocalPlayerIdRef.current = null
    setRummyOpponentId(null)
    rummyOpponentIdRef.current = null
    setRummyOpponentName('')
    rummyOpponentNameRef.current = ''
    setRummyView(null)
    setRummyConnection('connected')
    setRummyWaiting(false)
    // Phase 10
    phase10HostRef.current?.destroy()
    phase10HostRef.current = null
    phase10GuestRef.current?.destroy()
    phase10GuestRef.current = null
    phase10SessionRef.current = null
    setPhase10Role(null)
    setPhase10Code('')
    setPhase10LocalPlayerId(null)
    phase10LocalPlayerIdRef.current = null
    setPhase10OpponentId(null)
    phase10OpponentIdRef.current = null
    setPhase10OpponentName('')
    phase10OpponentNameRef.current = ''
    setPhase10View(null)
    setPhase10Connection('connected')
    setPhase10Waiting(false)
  }

  function whoActsNow(state: RoomState): { id: string; bot: boolean } | null {
    if (state.screen === 'hangman') {
      if (state.hangman.phase !== 'guessing' || state.hangman.over) return null
      const seat = state.seats[state.hangman.guesserIdx]
      return seat ? { id: seat.id, bot: seat.bot } : null
    }
    if (state.screen === 'farkle' || state.screen === 'yahtzee' || state.screen === 'ttt') {
      const seat = state.seats[state.turnIdx]
      return seat ? { id: seat.id, bot: seat.bot } : null
    }
    return null
  }

  function actorKey(state: RoomState): string {
    return `${state.screen}:${state.turnIdx}:${state.hangman.phase}:${state.hangman.guesserIdx}`
  }

  function stale(key: string) {
    return !roomRef.current || actorKey(roomRef.current) !== key
  }

  // ---- Rummy helpers ----

  function rummyActorKey(session: RummySession): string {
    const ps = session.session.publicState
    return `${ps.roundNumber}:${ps.turn.turnNumber}`
  }

  function rummyStale(key: string) {
    return !rummySessionRef.current || rummyActorKey(rummySessionRef.current) !== key
  }

  function rummyUpdateViews() {
    const session = rummySessionRef.current!
    const hostSnap = deriveSnapshot(session.session, rummyLocalPlayerIdRef.current!)
    setRummyView({ revision: hostSnap.revision, publicState: hostSnap.publicState, privateState: hostSnap.privateState!, opponentName: rummyOpponentNameRef.current })
    const opponentId = rummyOpponentIdRef.current
    if (opponentId && opponentId !== 'bot') {
      const guestSnap = deriveSnapshot(session.session, opponentId)
      rummyHostRef.current?.broadcast({ revision: guestSnap.revision, publicState: guestSnap.publicState, privateState: guestSnap.privateState!, opponentName: name })
    }
  }

  function startRummyHost() {
    const code = `RM-${generateCode()}`
    const hostId = peerIdForCode(code)
    setRummyRole('host')
    setRummyCode(code)
    setRummyLocalPlayerId(hostId)
    rummyLocalPlayerIdRef.current = hostId
    setRummyWaiting(true)
    setError(null)
    rummyHostRef.current = createHost<RummyView, RummyAction>(code, {
      onJoin(guestId, guestName) {
        if (rummySessionRef.current) {
          rummyHostRef.current?.reject(guestId, 'That Rummy table is already full.')
          return
        }
        const seed = Math.floor(Math.random() * 2147483647)
        rummySessionRef.current = createRummyGame([hostId, guestId], seed)
        setRummyOpponentId(guestId)
        rummyOpponentIdRef.current = guestId
        setRummyOpponentName(guestName)
        rummyOpponentNameRef.current = guestName
        setRummyWaiting(false)
        rummyUpdateViews()
      },
      onAction(guestId, action) {
        if (!rummySessionRef.current || guestId !== rummyOpponentIdRef.current) return
        const result = applyRummyAction(rummySessionRef.current!, guestId, action)
        if (!result.outcome.ok) return
        rummySessionRef.current = result.rummy
        rummyUpdateViews()
      },
      onLeave(guestId) {
        // Guest left mid-hand: match cannot continue with only 1 player.
        if (guestId !== rummyOpponentIdRef.current) return
        setError('Opponent left the room.')
      },
      onError(message) {
        setError(message)
      },
    })
  }

  function addRummyHouseBot() {
    if (rummyRole !== 'host' || !rummyLocalPlayerId || !rummyWaiting) return
    const botId = 'bot'
    const botName = randomBotName([name.trim()])
    const seed = Math.floor(Math.random() * 2147483647)
    rummySessionRef.current = createRummyGame([rummyLocalPlayerId, botId], seed)
    setRummyOpponentId(botId)
    rummyOpponentIdRef.current = botId
    setRummyOpponentName(botName)
    rummyOpponentNameRef.current = botName
    setRummyWaiting(false)
    rummyUpdateViews()
  }

  async function runRummyBot(botId: string, key: string) {
    while (!rummyStale(key)) {
      await wait(BASE_MS)
      if (rummyStale(key)) return
      const session = rummySessionRef.current!
      const ps = session.session.publicState
      if (ps.roundOver || currentPlayer(ps.turn) !== botId) return
      const result = runRummyBotTurn(session, botId, rummyBotStrategy)
      if (!result.outcome.ok) return
      rummySessionRef.current = result.rummy
      const snap = deriveSnapshot(result.rummy.session, rummyLocalPlayerId!)
      setRummyView({ revision: snap.revision, publicState: snap.publicState, privateState: snap.privateState!, opponentName: rummyOpponentNameRef.current })
    }
  }

  async function runRummyBotsIfNeeded() {
    if (rummyBotBusyRef.current) return
    const session = rummySessionRef.current
    if (!session) return
    const ps = session.session.publicState
    if (ps.roundOver || ps.matchWinnerId) return
    if (rummyOpponentId !== 'bot') return
    if (currentPlayer(ps.turn) !== 'bot') return
    rummyBotBusyRef.current = true
    const key = rummyActorKey(session)
    try {
      await runRummyBot('bot', key)
    } finally {
      rummyBotBusyRef.current = false
      setTimeout(() => runRummyBotsIfNeeded(), 50)
    }
  }

  function startRummyGuest(code: string) {
    if (!code) return
    setError(null)
    let localRevision = -1
    const handle = joinHost<RummyView, RummyAction>(code, name.trim(), {
      onState(view) {
        if (!shouldAcceptUpdate(localRevision, view.revision)) return
        localRevision = view.revision
        setRummyView(view)
        setRummyOpponentName(view.opponentName)
      },
      onError() {
        resetToEntry()
        setError('Could not reach that room. Check the code and try again.')
      },
      onRejected(reason) {
        resetToEntry()
        setError(reason)
      },
      onConnected() {
        setRummyConnection('connected')
      },
      onDisconnected() {
        setRummyConnection('disconnected')
      },
    })
    rummyGuestRef.current = handle
    setRummyRole('guest')
    setRummyCode(code)
    handle.peerId.then((id) => { setRummyLocalPlayerId(id); rummyLocalPlayerIdRef.current = id }).catch(() => {})
  }

  function rummyDispatch(action: RummyAction) {
    if (rummyRole === 'host' && rummyLocalPlayerId) {
      const result = applyRummyAction(rummySessionRef.current!, rummyLocalPlayerId, action)
      if (!result.outcome.ok) return
      rummySessionRef.current = result.rummy
      rummyUpdateViews()
    } else if (rummyRole === 'guest') {
      rummyGuestRef.current?.sendAction(action)
    }
  }

  function rummyRematch() {
    if (rummyRole !== 'host' || !rummySessionRef.current || !rummyLocalPlayerId) return
    const prevRevision = rummySessionRef.current.session.revision
    const playerIds = rummySessionRef.current.session.publicState.turn.playerOrder as [string, string]
    const seed = Math.floor(Math.random() * 2147483647)
    const next = createRummyGame(playerIds, seed)
    next.session = { ...next.session, revision: prevRevision + 1 }
    rummySessionRef.current = next
    rummyUpdateViews()
  }

  // ---- End Rummy helpers ----

  // ---- Phase 10 helpers ----

  function phase10ActorKey(session: Phase10Session): string {
    const ps = session.session.publicState
    return `${ps.roundNumber}:${ps.turn.turnNumber}`
  }

  function phase10Stale(key: string) {
    return !phase10SessionRef.current || phase10ActorKey(phase10SessionRef.current) !== key
  }

  function phase10UpdateViews() {
    const session = phase10SessionRef.current!
    const hostSnap = deriveSnapshot(session.session, phase10LocalPlayerIdRef.current!)
    setPhase10View({ revision: hostSnap.revision, publicState: hostSnap.publicState, privateState: hostSnap.privateState!, opponentName: phase10OpponentNameRef.current })
    const opponentId = phase10OpponentIdRef.current
    if (opponentId && opponentId !== 'bot') {
      const guestSnap = deriveSnapshot(session.session, opponentId)
      phase10HostRef.current?.broadcast({ revision: guestSnap.revision, publicState: guestSnap.publicState, privateState: guestSnap.privateState!, opponentName: name })
    }
  }

  function startPhase10Host() {
    const code = `P10-${generateCode()}`
    const hostId = peerIdForCode(code)
    setPhase10Role('host')
    setPhase10Code(code)
    setPhase10LocalPlayerId(hostId)
    phase10LocalPlayerIdRef.current = hostId
    setPhase10Waiting(true)
    setError(null)
    phase10HostRef.current = createHost<Phase10View, Phase10Action>(code, {
      onJoin(guestId, guestName) {
        if (phase10SessionRef.current) {
          phase10HostRef.current?.reject(guestId, 'That Phase 10 table is already full.')
          return
        }
        const seed = Math.floor(Math.random() * 2147483647)
        phase10SessionRef.current = createPhase10Game([hostId, guestId], seed)
        setPhase10OpponentId(guestId)
        phase10OpponentIdRef.current = guestId
        setPhase10OpponentName(guestName)
        phase10OpponentNameRef.current = guestName
        setPhase10Waiting(false)
        phase10UpdateViews()
      },
      onAction(guestId, action) {
        if (!phase10SessionRef.current || guestId !== phase10OpponentIdRef.current) return
        const result = applyPhase10Action(phase10SessionRef.current!, guestId, action)
        if (!result.outcome.ok) return
        phase10SessionRef.current = result.game
        phase10UpdateViews()
      },
      onLeave(guestId) {
        // Guest left mid-hand: match cannot continue with only 1 player.
        if (guestId !== phase10OpponentIdRef.current) return
        setError('Opponent left the room.')
      },
      onError(message) {
        setError(message)
      },
    })
  }

  function addPhase10HouseBot() {
    if (phase10Role !== 'host' || !phase10LocalPlayerId || !phase10Waiting) return
    const botId = 'bot'
    const botName = randomBotName([name.trim()])
    const seed = Math.floor(Math.random() * 2147483647)
    phase10SessionRef.current = createPhase10Game([phase10LocalPlayerId, botId], seed)
    setPhase10OpponentId(botId)
    phase10OpponentIdRef.current = botId
    setPhase10OpponentName(botName)
    phase10OpponentNameRef.current = botName
    setPhase10Waiting(false)
    phase10UpdateViews()
  }

  async function runPhase10Bot(botId: string, key: string) {
    while (!phase10Stale(key)) {
      await wait(BASE_MS)
      if (phase10Stale(key)) return
      const session = phase10SessionRef.current!
      const ps = session.session.publicState
      if (ps.roundOver || currentPlayer(ps.turn) !== botId) return
      const result = runPhase10BotTurn(session, botId, phase10BotStrategy)
      if (!result.outcome.ok) return
      phase10SessionRef.current = result.game
      const snap = deriveSnapshot(result.game.session, phase10LocalPlayerId!)
      setPhase10View({ revision: snap.revision, publicState: snap.publicState, privateState: snap.privateState!, opponentName: phase10OpponentNameRef.current })
    }
  }

  async function runPhase10BotsIfNeeded() {
    if (phase10BotBusyRef.current) return
    const session = phase10SessionRef.current
    if (!session) return
    const ps = session.session.publicState
    if (ps.roundOver || ps.matchWinnerId) return
    if (phase10OpponentId !== 'bot') return
    if (currentPlayer(ps.turn) !== 'bot') return
    phase10BotBusyRef.current = true
    const key = phase10ActorKey(session)
    try {
      await runPhase10Bot('bot', key)
    } finally {
      phase10BotBusyRef.current = false
      setTimeout(() => runPhase10BotsIfNeeded(), 50)
    }
  }

  function startPhase10Guest(code: string) {
    if (!code) return
    setError(null)
    let localRevision = -1
    const handle = joinHost<Phase10View, Phase10Action>(code, name.trim(), {
      onState(view) {
        if (!shouldAcceptUpdate(localRevision, view.revision)) return
        localRevision = view.revision
        setPhase10View(view)
        setPhase10OpponentName(view.opponentName)
      },
      onError() {
        resetToEntry()
        setError('Could not reach that room. Check the code and try again.')
      },
      onRejected(reason) {
        resetToEntry()
        setError(reason)
      },
      onConnected() {
        setPhase10Connection('connected')
      },
      onDisconnected() {
        setPhase10Connection('disconnected')
      },
    })
    phase10GuestRef.current = handle
    setPhase10Role('guest')
    setPhase10Code(code)
    handle.peerId.then((id) => { setPhase10LocalPlayerId(id); phase10LocalPlayerIdRef.current = id }).catch(() => {})
  }

  function phase10Dispatch(action: Phase10Action) {
    if (phase10Role === 'host' && phase10LocalPlayerId) {
      const result = applyPhase10Action(phase10SessionRef.current!, phase10LocalPlayerId, action)
      if (!result.outcome.ok) return
      phase10SessionRef.current = result.game
      phase10UpdateViews()
    } else if (phase10Role === 'guest') {
      phase10GuestRef.current?.sendAction(action)
    }
  }

  function phase10Rematch() {
    if (phase10Role !== 'host' || !phase10SessionRef.current || !phase10LocalPlayerId) return
    const prevRevision = phase10SessionRef.current.session.revision
    const playerIds = phase10SessionRef.current.session.publicState.turn.playerOrder as [string, string]
    const seed = Math.floor(Math.random() * 2147483647)
    const next = createPhase10Game(playerIds, seed)
    next.session = { ...next.session, revision: prevRevision + 1 }
    phase10SessionRef.current = next
    phase10UpdateViews()
  }

  // ---- End Phase 10 helpers ----

  async function runFarkleBot(seatId: string, key: string) {
    while (!stale(key)) {
      const pace = roomRef.current!.botPace
      await wait(BASE_MS * pace)
      if (stale(key)) return
      const rolled = hostApply({ type: 'farkleRoll' }, seatId)
      if (!rolled) return
      if (rolled.farkle.farkle) {
        await wait(BASE_MS * pace)
        if (stale(key)) return
        hostApply({ type: 'farkleEndTurn' }, seatId)
        return
      }
      const seat = rolled.seats.find((s) => s.id === seatId)!
      const move = decideFarkleBot(
        rolled.farkle.dice.map((d) => d.val), rolled.farkle.turnScore, seat.score,
        rolled.farkle.openingScore, rolled.farkle.winningScore, rolled.botDifficulty,
      )
      await wait(BASE_MS * pace * 0.6)
      if (stale(key)) return
      let cur = rolled
      for (const idx of move.keepIndices) {
        const dieId = cur.farkle.dice[idx].id
        const next = hostApply({ type: 'farkleToggle', dieId }, seatId)
        if (!next) return
        cur = next
      }
      await wait(BASE_MS * pace * 0.6)
      if (stale(key)) return
      if (move.bank) {
        hostApply({ type: 'farkleBank' }, seatId)
        return
      }
    }
  }

  async function runYahtzeeBot(seatId: string, key: string) {
    const pace = roomRef.current!.botPace
    await wait(BASE_MS * pace)
    if (stale(key)) return
    let state = hostApply({ type: 'yahtzeeRoll' }, seatId)
    if (!state) return
    while (state.yahtzee.rollsLeft > 0 && !stale(key)) {
      await wait(BASE_MS * pace * 0.6)
      if (stale(key)) return
      const holdIds = decideYahtzeeHold(state.yahtzee.dice, state.yahtzee.cards[seatId] ?? {}, state.botDifficulty)
      let cur = state
      for (const dieId of holdIds) {
        const next = hostApply({ type: 'yahtzeeToggleHold', dieId }, seatId)
        if (!next) return
        cur = next
      }
      state = cur
      await wait(BASE_MS * pace * 0.6)
      if (stale(key)) return
      const rolled = hostApply({ type: 'yahtzeeRoll' }, seatId)
      if (!rolled) return
      state = rolled
    }
    if (stale(key)) return
    await wait(BASE_MS * pace * 0.5)
    if (stale(key)) return
    const vals = state.yahtzee.dice.map((d) => d.val)
    const category = decideYahtzeeCategory(vals, state.yahtzee.cards[seatId] ?? {}, state.botDifficulty)
    hostApply({ type: 'yahtzeeScore', category }, seatId)
  }

  async function runTttBot(seatId: string, key: string) {
    const pace = roomRef.current!.botPace
    await wait(BASE_MS * pace)
    if (stale(key)) return
    const state = roomRef.current!
    const me = state.seats.findIndex((s) => s.id === seatId)
    const opponent = state.seats.findIndex((s) => s.id !== seatId)
    const cell = decideTttMove(state.ttt.board, me, opponent)
    hostApply({ type: 'tttPlay', cell }, seatId)
  }

  async function runHangmanBot(seatId: string, key: string) {
    while (!stale(key)) {
      const pace = roomRef.current!.botPace
      await wait(BASE_MS * pace)
      if (stale(key)) return
      const state = roomRef.current!
      if (state.screen !== 'hangman' || state.hangman.phase !== 'guessing' || state.hangman.over) return
      const letter = decideHangmanLetter(state.hangman.guessed)
      const next = hostApply({ type: 'hangmanGuess', letter }, seatId)
      if (!next) return
      if (next.hangman.over || next.screen !== 'hangman') return
    }
  }

  async function runBotsIfNeeded() {
    if (botBusyRef.current) return
    const state = roomRef.current
    if (!state) return
    const actor = whoActsNow(state)
    if (!actor || !actor.bot) return
    botBusyRef.current = true
    const myKey = actorKey(state)
    try {
      if (state.screen === 'farkle') await runFarkleBot(actor.id, myKey)
      else if (state.screen === 'yahtzee') await runYahtzeeBot(actor.id, myKey)
      else if (state.screen === 'ttt') await runTttBot(actor.id, myKey)
      else if (state.screen === 'hangman') await runHangmanBot(actor.id, myKey)
    } finally {
      botBusyRef.current = false
      setTimeout(() => runBotsIfNeeded(), 50)
    }
  }

  useEffect(() => {
    if (role !== 'host' || !room) return
    runBotsIfNeeded()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role, room?.screen, room?.turnIdx, room?.hangman.phase, room?.hangman.guesserIdx])

  // Pause on a finished Tic-Tac-Toe round (winning line still visible) before moving
  // on, whether the round ended on a bot's move or a human's — otherwise it flashes past.
  useEffect(() => {
    if (role !== 'host' || !room) return
    if (room.screen === 'ttt' && room.ttt.roundOver) {
      const t = setTimeout(() => dispatch({ type: 'tttAdvanceRound' }), ROUND_PAUSE_MS)
      return () => clearTimeout(t)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role, room?.screen, room?.ttt.roundOver])

  // ---- Rummy effects (host-only) ----

  // Bot turn trigger
  useEffect(() => {
    if (rummyRole !== 'host' || !rummyView) return
    runRummyBotsIfNeeded()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rummyRole, rummyView])

  // Round transition (pause then start next round)
  useEffect(() => {
    if (rummyRole !== 'host' || !rummyView) return
    if (rummyView.publicState.roundOver && !rummyView.publicState.matchWinnerId) {
      const t = setTimeout(() => {
        const result = applyRummyAction(rummySessionRef.current!, rummyLocalPlayerId!, { type: 'START_NEXT_ROUND' })
        if (result.outcome.ok) {
          rummySessionRef.current = result.rummy
          rummyUpdateViews()
        }
      }, ROUND_PAUSE_MS)
      return () => clearTimeout(t)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rummyRole, rummyView?.publicState.roundOver])

  // ---- Derived opponentId for guest (avoid async ordering bug) ----
  const resolvedRummyOpponentId = useMemo(() => {
    if (!rummyView || !rummyLocalPlayerId) return null
    return rummyView.publicState.turn.playerOrder.find((id) => id !== rummyLocalPlayerId) ?? null
  }, [rummyView, rummyLocalPlayerId])

  // ---- Phase 10 effects (host-only) ----

  // Bot turn trigger
  useEffect(() => {
    if (phase10Role !== 'host' || !phase10View) return
    runPhase10BotsIfNeeded()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase10Role, phase10View])

  // Round transition (pause then start next round)
  useEffect(() => {
    if (phase10Role !== 'host' || !phase10View) return
    if (phase10View.publicState.roundOver && !phase10View.publicState.matchWinnerId) {
      const t = setTimeout(() => {
        const result = applyPhase10Action(phase10SessionRef.current!, phase10LocalPlayerId!, { type: 'START_NEXT_ROUND' })
        if (result.outcome.ok) {
          phase10SessionRef.current = result.game
          phase10UpdateViews()
        }
      }, ROUND_PAUSE_MS)
      return () => clearTimeout(t)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase10Role, phase10View?.publicState.roundOver])

  // ---- Derived opponentId for Phase 10 guest (avoid async ordering bug) ----
  const resolvedPhase10OpponentId = useMemo(() => {
    if (!phase10View || !phase10LocalPlayerId) return null
    return phase10View.publicState.turn.playerOrder.find((id) => id !== phase10LocalPlayerId) ?? null
  }, [phase10View, phase10LocalPlayerId])

  // ---- Render ----

  // Landing: dice games, Rummy, and Phase 10 are all not yet in a session
  if (!room && !rummyRole && !phase10Role) {
    return (
      <Landing
        name={name}
        onNameChange={setName}
        joinCode={joinCodeInput}
        onJoinCodeChange={setJoinCodeInput}
        onJoin={() => {
          const code = joinCodeInput.trim()
          if (code.startsWith('RM-')) startRummyGuest(code)
          else if (code.startsWith('P10-')) startPhase10Guest(code)
          else startGuest(code)
        }}
        onPickGame={(g) => startHost(g)}
        onPickRummy={startRummyHost}
        onPickPhase10={startPhase10Host}
        error={error}
      />
    )
  }

  // Dice-game session active
  if (room) {
    const isHost = role === 'host'

    return (
      <>
        {room.screen === 'room' && (
          <Room
            room={room}
            isHost={isHost}
            onPickGame={(g) => dispatch({ type: 'pickGame', game: g })}
            onAddBot={() => dispatch({ type: 'addBot' })}
            onSetDifficulty={(d) => dispatch({ type: 'setBotDifficulty', difficulty: d })}
            onStart={() => dispatch({ type: 'startGame' })}
            onLeave={resetToEntry}
            onOpenRules={() => setRulesOpen(true)}
          />
        )}
        {room.screen === 'farkle' && (
          <FarkleTable
            room={room}
            localSeatId={localSeatId}
            onRoll={() => dispatch({ type: 'farkleRoll' })}
            onToggle={(dieId) => dispatch({ type: 'farkleToggle', dieId })}
            onBank={() => dispatch({ type: 'farkleBank' })}
            onEndTurn={() => dispatch({ type: 'farkleEndTurn' })}
            onOpenRules={() => setRulesOpen(true)}
            onLeave={resetToEntry}
          />
        )}
        {room.screen === 'yahtzee' && (
          <YahtzeeTable
            room={room}
            localSeatId={localSeatId}
            onRoll={() => dispatch({ type: 'yahtzeeRoll' })}
            onToggleHold={(dieId) => dispatch({ type: 'yahtzeeToggleHold', dieId })}
            onScore={(category) => dispatch({ type: 'yahtzeeScore', category })}
            onOpenRules={() => setRulesOpen(true)}
            onLeave={resetToEntry}
          />
        )}
        {room.screen === 'ttt' && (
          <TttTable
            room={room}
            localSeatId={localSeatId}
            onPlay={(cell) => dispatch({ type: 'tttPlay', cell })}
            onOpenRules={() => setRulesOpen(true)}
            onLeave={resetToEntry}
          />
        )}
        {room.screen === 'hangman' && (
          <HangmanTable
            room={room}
            localSeatId={localSeatId}
            onSetWord={(word) => dispatch({ type: 'hangmanSetWord', word })}
            onGuess={(letter) => dispatch({ type: 'hangmanGuess', letter })}
            onAdvanceRound={() => dispatch({ type: 'hangmanAdvanceRound' })}
            onOpenRules={() => setRulesOpen(true)}
            onLeave={resetToEntry}
          />
        )}
        {room.screen === 'results' && (
          <Results
            room={room}
            localSeatId={localSeatId}
            isHost={isHost}
            onRematch={() => dispatch({ type: 'rematch' })}
            onBackToShelf={resetToEntry}
          />
        )}
        {rulesOpen && <RulesOverlay game={room.game} onClose={() => setRulesOpen(false)} />}
      </>
    )
  }

  // ---- Rummy session active ----
  // Rummy waiting screen (host waiting for opponent) — mirrors the shared Room.tsx
  // layout dice games use, so Rummy's start flow doesn't feel like a different app.
  if (rummyRole === 'host' && rummyWaiting) {
    return (
      <RummyRoom
        code={rummyCode}
        localName={name}
        notice={error}
        onAddHouseBot={addRummyHouseBot}
        onLeave={resetToEntry}
      />
    )
  }

  // Rummy match results
  if (rummyView?.publicState.matchWinnerId) {
    return (
      <RummyResults
        localPlayerId={rummyLocalPlayerId ?? ''}
        localName={name}
        opponentName={rummyOpponentName}
        publicState={rummyView.publicState}
        isHost={rummyRole === 'host'}
        notice={error}
        onRematch={rummyRematch}
        onBackToShelf={resetToEntry}
      />
    )
  }

  // Rummy table (active game)
  if (rummyView && rummyLocalPlayerId) {
    const opponentHandCount = resolvedRummyOpponentId
      ? (rummyView.publicState.handCounts[resolvedRummyOpponentId] ?? 0)
      : 0

    return (
      <RummyTable
        code={rummyCode}
        localPlayerId={rummyLocalPlayerId}
        localName={name}
        opponentName={rummyOpponentName}
        opponentColor="var(--violet)"
        opponentHandCount={opponentHandCount}
        connection={rummyConnection}
        notice={error}
        publicState={rummyView.publicState}
        hand={rummyView.privateState.hand.cards}
        onDrawStock={() => rummyDispatch({ type: 'DRAW_FROM_STOCK' })}
        onDrawDiscard={(index) => rummyDispatch({ type: 'DRAW_FROM_DISCARD', index })}
        onLayDownMeld={(cardIds) => rummyDispatch({ type: 'LAY_DOWN_MELD', cardIds })}
        onLayOffMeld={(targetPlayerId, meldIndex, cardIds) => rummyDispatch({ type: 'LAY_OFF', targetPlayerId, meldIndex, cardIds })}
        onDiscard={(cardId) => rummyDispatch({ type: 'DISCARD_CARD', cardId })}
        onOpenRules={() => {}}
        onLeave={resetToEntry}
      />
    )
  }

  // ---- Phase 10 session active ----
  // Phase 10 waiting screen (host waiting for opponent) — mirrors the shared Room.tsx /
  // RummyRoom.tsx layout so the start flow doesn't feel like a different app.
  if (phase10Role === 'host' && phase10Waiting) {
    return (
      <Phase10Room
        code={phase10Code}
        localName={name}
        notice={error}
        onAddHouseBot={addPhase10HouseBot}
        onLeave={resetToEntry}
      />
    )
  }

  // Phase 10 match results
  if (phase10View?.publicState.matchWinnerId) {
    return (
      <Phase10Results
        localPlayerId={phase10LocalPlayerId ?? ''}
        localName={name}
        opponentName={phase10OpponentName}
        publicState={phase10View.publicState}
        isHost={phase10Role === 'host'}
        notice={error}
        onRematch={phase10Rematch}
        onBackToShelf={resetToEntry}
      />
    )
  }

  // Phase 10 table (active game)
  if (phase10View && phase10LocalPlayerId) {
    const opponentHandCount = resolvedPhase10OpponentId
      ? (phase10View.publicState.handCounts[resolvedPhase10OpponentId] ?? 0)
      : 0

    return (
      <Phase10Table
        code={phase10Code}
        localPlayerId={phase10LocalPlayerId}
        localName={name}
        opponentName={phase10OpponentName}
        opponentColor="#1aa06d"
        opponentHandCount={opponentHandCount}
        connection={phase10Connection}
        notice={error}
        publicState={phase10View.publicState}
        hand={phase10View.privateState.hand.cards}
        onDrawStock={() => phase10Dispatch({ type: 'DRAW_FROM_STOCK' })}
        onDrawDiscard={() => phase10Dispatch({ type: 'DRAW_FROM_DISCARD' })}
        onLayPhase={(cardIds) => phase10Dispatch({ type: 'LAY_PHASE', cardIds })}
        onHit={(targetPlayerId, groupIndex, cardIds) => phase10Dispatch({ type: 'HIT', targetPlayerId, groupIndex, cardIds })}
        onDiscard={(cardId) => phase10Dispatch({ type: 'DISCARD_CARD', cardId })}
        onOpenRules={() => {}}
        onLeave={resetToEntry}
      />
    )
  }

  // Fallback (shouldn't normally be reached)
  return null
}
