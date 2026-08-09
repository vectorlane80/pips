import { describe, expect, it } from 'vitest'
import { applyAction, createHostSession } from '../engine/sync.ts'
import type { ActionValidator, HostSession } from '../engine/sync.ts'
import { runBotTurn } from './bot.ts'

// ---------------------------------------------------------------------------
// Test type shapes (mirror sync.test.ts)
// ---------------------------------------------------------------------------

type TPublicState = { turn: string }
type TPrivateState = { hand: string[] }
type TAction = { type: 'DRAW' } | { type: 'DISCARD'; card: string }

// ---------------------------------------------------------------------------
// Bot only sees its own private state
// ---------------------------------------------------------------------------

describe('runBotTurn — bot only sees its own private state', () => {
  it('strategy receives the bot players own privateState, not merged/other', () => {
    let capturedPublic: TPublicState | undefined
    let capturedPrivate: TPrivateState | undefined

    const session: HostSession<TPublicState, TPrivateState> = {
      revision: 0,
      publicState: { turn: 'p1' },
      privateStates: {
        p1: { hand: ['c1', 'c2'] },
        p2: { hand: ['c3', 'c4'] },
      },
    }

    const strategy = (pub: TPublicState, priv: TPrivateState, _pid: string): TAction => {
      capturedPublic = pub
      capturedPrivate = priv
      return { type: 'DRAW' }
    }

    const accept: ActionValidator<TPublicState, TPrivateState, TAction> = (
      s,
      _playerId,
      _action,
    ) => ({
      ok: true,
      publicState: s.publicState,
      privateStates: s.privateStates,
    })

    runBotTurn(session, 'p1', strategy, accept)

    // Strategy was called with p1's own private state
    expect(capturedPublic).toEqual({ turn: 'p1' })
    expect(capturedPrivate).toEqual({ hand: ['c1', 'c2'] })
    // Not p2's
    expect(capturedPrivate).not.toEqual({ hand: ['c3', 'c4'] })
    // Not merged
    expect(capturedPrivate).not.toEqual({ hand: ['c1', 'c2', 'c3', 'c4'] })
  })
})

// ---------------------------------------------------------------------------
// Legal action succeeds through the same path as a human would
// ---------------------------------------------------------------------------

describe('runBotTurn — legal action succeeds through the same path', () => {
  it('revision incremented, states match validator output, equal to direct applyAction', () => {
    const startSession = createHostSession<TPublicState, TPrivateState>(
      { turn: 'p1' },
      { p1: { hand: ['c1'] }, p2: { hand: ['c2'] } },
    )

    const validator: ActionValidator<TPublicState, TPrivateState, TAction> = (
      _session,
      _playerId,
      action,
    ) => {
      if (action.type === 'DRAW') {
        return {
          ok: true,
          publicState: { turn: 'p2' },
          privateStates: {
            p1: { hand: ['c1', 'c3'] },
            p2: { hand: ['c2'] },
          },
        }
      }
      return { ok: false, reason: 'unknown action' }
    }

    const strategy = (): TAction => ({ type: 'DRAW' })

    // Bot path
    const botResult = runBotTurn(startSession, 'p1', strategy, validator)

    // Human path — same action, same starting session
    const humanResult = applyAction(startSession, 'p1', { type: 'DRAW' }, validator)

    // Bot result
    expect(botResult.outcome.ok).toBe(true)
    expect(botResult.session.revision).toBe(1)
    expect(botResult.session.publicState).toEqual({ turn: 'p2' })
    expect(botResult.session.privateStates).toEqual({
      p1: { hand: ['c1', 'c3'] },
      p2: { hand: ['c2'] },
    })

    // Deep-equal to human path
    expect(botResult.session).toEqual(humanResult.session)
    expect(botResult.outcome).toEqual(humanResult.outcome)
  })
})

// ---------------------------------------------------------------------------
// Illegal action is rejected the same way a human's would be
// ---------------------------------------------------------------------------

describe('runBotTurn — illegal action rejected same as human', () => {
  it('returns original session unchanged with ok: false', () => {
    const startSession = createHostSession<TPublicState, TPrivateState>(
      { turn: 'p1' },
      { p1: { hand: ['c1'] }, p2: { hand: ['c2'] } },
    )

    const rejector: ActionValidator<TPublicState, TPrivateState, TAction> = () => ({
      ok: false,
      reason: 'not your turn',
    })

    const strategy = (): TAction => ({ type: 'DRAW' })

    const result = runBotTurn(startSession, 'p2', strategy, rejector)

    expect(result.outcome.ok).toBe(false)
    expect(result.outcome.reason).toBe('not your turn')
    expect(result.session).toBe(startSession)
    expect(result.session.revision).toBe(0)
    expect(result.session.publicState).toEqual({ turn: 'p1' })
    expect(result.session.privateStates).toEqual({
      p1: { hand: ['c1'] },
      p2: { hand: ['c2'] },
    })
  })
})

// ---------------------------------------------------------------------------
// playerId is passed through correctly
// ---------------------------------------------------------------------------

describe('runBotTurn — playerId passed through', () => {
  it('strategy receives the exact playerId string', () => {
    let capturedPlayerId = ''

    const session = createHostSession<TPublicState, TPrivateState>(
      { turn: 'p2' },
      { p1: { hand: ['c1'] }, p2: { hand: ['c2'] } },
    )

    const strategy = (_pub: TPublicState, _priv: TPrivateState, pid: string): TAction => {
      capturedPlayerId = pid
      return { type: 'DRAW' }
    }

    const accept: ActionValidator<TPublicState, TPrivateState, TAction> = (
      s,
      _playerId,
      _action,
    ) => ({
      ok: true,
      publicState: s.publicState,
      privateStates: s.privateStates,
    })

    runBotTurn(session, 'p2', strategy, accept)

    expect(capturedPlayerId).toBe('p2')
  })

  it('the validator (applyAction) is itself invoked with the bots own playerId, not a wrong or fabricated one', () => {
    let validatorSawPlayerId = ''

    const session = createHostSession<TPublicState, TPrivateState>(
      { turn: 'p2' },
      { p1: { hand: ['c1'] }, p2: { hand: ['c2'] } },
    )

    const strategy = (): TAction => ({ type: 'DRAW' })

    const accept: ActionValidator<TPublicState, TPrivateState, TAction> = (
      s,
      playerId,
      _action,
    ) => {
      validatorSawPlayerId = playerId
      return { ok: true, publicState: s.publicState, privateStates: s.privateStates }
    }

    runBotTurn(session, 'p2', strategy, accept)

    expect(validatorSawPlayerId).toBe('p2')
  })
})
