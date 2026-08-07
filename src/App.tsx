import { useEffect, useMemo, useRef, useState } from 'react'
import type { Action, Game, RoomState } from './types'
import { addSeat, applyAction, generateCode, makeRoom, removeSeat } from './state/room'
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
import { deriveSnapshot } from './card-engine/sync'
import { currentPlayer } from './card-engine/turn-engine'
import { RummyTable } from './screens/RummyTable'
import { RummyResults } from './screens/RummyResults'

type RummyView = { publicState: RummyPublicState; privateState: RummyPrivateState; opponentName: string }

const BASE_MS = 1100
const ROUND_PAUSE_MS = 2400

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
  const [rummyConnection, setRummyConnection] = useState<'connected' | 'reconnecting'>('connected')
  const [rummyWaiting, setRummyWaiting] = useState(false)

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

  useEffect(() => {
    roomRef.current = room
  }, [room])

  useEffect(() => () => {
    hostRef.current?.destroy()
    guestRef.current?.destroy()
    rummyHostRef.current?.destroy()
    rummyGuestRef.current?.destroy()
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
    setRummyView({ publicState: hostSnap.publicState, privateState: hostSnap.privateState, opponentName: rummyOpponentNameRef.current })
    const opponentId = rummyOpponentIdRef.current
    if (opponentId && opponentId !== 'bot') {
      const guestSnap = deriveSnapshot(session.session, opponentId)
      rummyHostRef.current?.broadcast({ publicState: guestSnap.publicState, privateState: guestSnap.privateState, opponentName: name })
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
        if (rummySessionRef.current) return // already have an opponent
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
        const result = applyRummyAction(rummySessionRef.current!, guestId, action)
        if (!result.outcome.ok) return
        rummySessionRef.current = result.rummy
        rummyUpdateViews()
      },
      onLeave(_guestId) {
        // Guest left mid-hand: match cannot continue with only 1 player.
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
    const seed = Math.floor(Math.random() * 2147483647)
    rummySessionRef.current = createRummyGame([rummyLocalPlayerId, botId], seed)
    setRummyOpponentId(botId)
    rummyOpponentIdRef.current = botId
    setRummyOpponentName('House')
    rummyOpponentNameRef.current = 'House'
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
      setRummyView({ publicState: snap.publicState, privateState: snap.privateState, opponentName: rummyOpponentNameRef.current })
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
    const handle = joinHost<RummyView, RummyAction>(code, name.trim(), {
      onState(view) {
        setRummyView(view)
        setRummyOpponentName(view.opponentName)
      },
      onError() {
        setError('Could not reach that room. Check the code and try again.')
      },
      onConnected() {
        setRummyConnection('connected')
      },
      onDisconnected() {
        setRummyConnection('reconnecting')
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
    const playerIds = rummySessionRef.current.session.publicState.turn.playerOrder as [string, string]
    const seed = Math.floor(Math.random() * 2147483647)
    rummySessionRef.current = createRummyGame(playerIds, seed)
    rummyUpdateViews()
  }

  // ---- End Rummy helpers ----

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

  // Pause on a finished round (winning line / solved-or-lost word still visible) before moving
  // on, whether the round ended on a bot's move or a human's — otherwise it flashes past.
  useEffect(() => {
    if (role !== 'host' || !room) return
    if (room.screen === 'ttt' && room.ttt.roundOver) {
      const t = setTimeout(() => dispatch({ type: 'tttAdvanceRound' }), ROUND_PAUSE_MS)
      return () => clearTimeout(t)
    }
    if (room.screen === 'hangman' && room.hangman.phase === 'roundOver') {
      const t = setTimeout(() => dispatch({ type: 'hangmanAdvanceRound' }), ROUND_PAUSE_MS)
      return () => clearTimeout(t)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role, room?.screen, room?.ttt.roundOver, room?.hangman.phase])

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

  // ---- Render ----

  // Landing: dice games OR rummy is not yet in a session
  if (!room && !rummyRole) {
    return (
      <Landing
        name={name}
        onNameChange={setName}
        joinCode={joinCodeInput}
        onJoinCodeChange={setJoinCodeInput}
        onJoin={() => {
          const code = joinCodeInput.trim()
          if (code.startsWith('RM-')) startRummyGuest(code)
          else startGuest(code)
        }}
        onPickGame={(g) => startHost(g)}
        onPickRummy={startRummyHost}
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
  // Rummy waiting screen (host waiting for opponent)
  if (rummyRole === 'host' && rummyWaiting) {
    return (
      <div style={{ maxWidth: 600, margin: '0 auto', padding: 'clamp(28px,6vw,72px) clamp(18px,5vw,48px) 72px', textAlign: 'center' }}>
        <span className="chip" style={{ background: 'var(--yellow)', color: 'var(--ink)' }}>Rummy · {rummyCode}</span>
        <h1 style={{ fontSize: 'clamp(34px,5vw,48px)', fontWeight: 700, margin: '20px 0 8px' }}>Rummy Room</h1>
        <p style={{ color: 'var(--body-text)', lineHeight: 1.5, marginBottom: 20 }}>
          Share the code or add a house player to get started.
        </p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-coral btn-lg" onClick={addRummyHouseBot}>
            Add a house player
          </button>
          <button type="button" className="btn btn-lg" onClick={resetToEntry}>
            Leave
          </button>
        </div>
      </div>
    )
  }

  // Rummy match results
  if (rummyView?.publicState.matchWinnerId) {
    const opponentName = resolvedRummyOpponentId === 'bot' ? 'House' : rummyOpponentName
    const opponentId = resolvedRummyOpponentId ?? ''
    return (
      <RummyResults
        localPlayerId={rummyLocalPlayerId ?? ''}
        localName={name}
        opponentName={opponentId === 'bot' ? 'House' : opponentName}
        publicState={rummyView.publicState}
        isHost={rummyRole === 'host'}
        onRematch={rummyRematch}
        onBackToShelf={resetToEntry}
      />
    )
  }

  // Rummy table (active game)
  if (rummyView && rummyLocalPlayerId) {
    const opponentName = resolvedRummyOpponentId === 'bot' ? 'House' : rummyOpponentName
    const opponentHandCount = resolvedRummyOpponentId
      ? (rummyView.publicState.handCounts[resolvedRummyOpponentId] ?? 0)
      : 0

    return (
      <RummyTable
        code={rummyCode}
        localPlayerId={rummyLocalPlayerId}
        localName={name}
        opponentName={opponentName}
        opponentColor="var(--violet)"
        opponentHandCount={opponentHandCount}
        connection={rummyConnection}
        publicState={rummyView.publicState}
        hand={rummyView.privateState.hand.cards}
        onDrawStock={() => rummyDispatch({ type: 'DRAW_FROM_STOCK' })}
        onDrawDiscard={(index) => rummyDispatch({ type: 'DRAW_FROM_DISCARD', index })}
        onLayDownMeld={(cardIds) => rummyDispatch({ type: 'LAY_DOWN_MELD', cardIds })}
        onDiscard={(cardId) => rummyDispatch({ type: 'DISCARD_CARD', cardId })}
        onOpenRules={() => {}}
        onLeave={resetToEntry}
      />
    )
  }

  // Fallback (shouldn't normally be reached)
  return null
}
