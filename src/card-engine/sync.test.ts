import { describe, expect, it } from 'vitest'
import {
  applyAction,
  assertWireSafe,
  createHostSession,
  deriveSnapshot,
  isJsonSerializable,
  shouldAcceptUpdate,
} from './sync.ts'
import type { ActionValidator, HostSession } from './sync.ts'

// ---------------------------------------------------------------------------
// Test type shapes
// ---------------------------------------------------------------------------

type TPublicState = { turn: string }
type TPrivateState = { hand: string[] }
type TAction = { type: 'DRAW' } | { type: 'DISCARD'; card: string }

// ---------------------------------------------------------------------------
// createHostSession
// ---------------------------------------------------------------------------

describe('createHostSession', () => {
  it('produces { revision: 0, publicState, privateStates } exactly as given', () => {
    const session = createHostSession<TPublicState, TPrivateState>(
      { turn: 'p1' },
      { p1: { hand: ['c1'] }, p2: { hand: ['c2'] } },
    )
    expect(session).toEqual({
      revision: 0,
      publicState: { turn: 'p1' },
      privateStates: { p1: { hand: ['c1'] }, p2: { hand: ['c2'] } },
    })
  })
})

// ---------------------------------------------------------------------------
// applyAction — valid action
// ---------------------------------------------------------------------------

describe('applyAction — valid action', () => {
  it('increments revision by 1 and returns new publicState/privateStates from outcome', () => {
    const assertNever: ActionValidator<TPublicState, TPrivateState, TAction> = (
      _session,
      _playerId,
      _action,
    ) => ({
      ok: true,
      publicState: { turn: 'p2' },
      privateStates: { p1: { hand: ['c1'] }, p2: { hand: ['c2', 'c3'] } },
    })

    const session = createHostSession<TPublicState, TPrivateState>(
      { turn: 'p1' },
      { p1: { hand: ['c1'] }, p2: { hand: ['c2'] } },
    )

    const result = applyAction(session, 'p1', { type: 'DRAW' }, assertNever)

    expect(result.outcome.ok).toBe(true)
    expect(result.session.revision).toBe(1)
    expect(result.session.publicState).toEqual({ turn: 'p2' })
    expect(result.session.privateStates).toEqual({
      p1: { hand: ['c1'] },
      p2: { hand: ['c2', 'c3'] },
    })
  })

  it('returns a new session object (immutability)', () => {
    const validator: ActionValidator<TPublicState, TPrivateState, TAction> = () => ({
      ok: true,
      publicState: { turn: 'p2' },
      privateStates: { p1: { hand: [] }, p2: { hand: [] } },
    })

    const session = createHostSession<TPublicState, TPrivateState>(
      { turn: 'p1' },
      { p1: { hand: ['c1'] }, p2: { hand: ['c2'] } },
    )

    const result = applyAction(session, 'p1', { type: 'DRAW' }, validator)
    expect(result.session).not.toBe(session)
  })
})

// ---------------------------------------------------------------------------
// applyAction — invalid action rejection
// ---------------------------------------------------------------------------

describe('applyAction — invalid action rejection', () => {
  it('returns original session unchanged with ok: false and reason preserved', () => {
    const rejector: ActionValidator<TPublicState, TPrivateState, TAction> = () => ({
      ok: false,
      reason: 'not your turn',
    })

    const session = createHostSession<TPublicState, TPrivateState>(
      { turn: 'p1' },
      { p1: { hand: ['c1'] }, p2: { hand: ['c2'] } },
    )

    const result = applyAction(session, 'p2', { type: 'DRAW' }, rejector)

    expect(result.outcome.ok).toBe(false)
    expect(result.outcome.reason).toBe('not your turn')
    expect(result.session).toBe(session)
    expect(result.session.revision).toBe(0)
    expect(result.session.publicState).toEqual({ turn: 'p1' })
    expect(result.session.privateStates).toEqual({
      p1: { hand: ['c1'] },
      p2: { hand: ['c2'] },
    })
  })
})

// ---------------------------------------------------------------------------
// applyAction — buggy validator (ok: true but no state)
// ---------------------------------------------------------------------------

describe('applyAction — buggy validator (ok: true but no state)', () => {
  it('treats ok:true without publicState as rejection', () => {
    const buggyNoPublic: ActionValidator<TPublicState, TPrivateState, TAction> = () => ({
      ok: true,
      privateStates: { p1: { hand: [] }, p2: { hand: [] } },
    })

    const session = createHostSession<TPublicState, TPrivateState>(
      { turn: 'p1' },
      { p1: { hand: ['c1'] }, p2: { hand: ['c2'] } },
    )

    const result = applyAction(session, 'p1', { type: 'DRAW' }, buggyNoPublic)
    expect(result.outcome.ok).toBe(false)
    expect(result.outcome.reason).toBe('validator returned ok without state')
    expect(result.session).toBe(session)
    expect(result.session.revision).toBe(0)
  })

  it('treats ok:true without privateStates as rejection', () => {
    const buggyNoPrivate: ActionValidator<TPublicState, TPrivateState, TAction> = () => ({
      ok: true,
      publicState: { turn: 'p2' },
    })

    const session = createHostSession<TPublicState, TPrivateState>(
      { turn: 'p1' },
      { p1: { hand: ['c1'] }, p2: { hand: ['c2'] } },
    )

    const result = applyAction(session, 'p1', { type: 'DRAW' }, buggyNoPrivate)
    expect(result.outcome.ok).toBe(false)
    expect(result.outcome.reason).toBe('validator returned ok without state')
    expect(result.session).toBe(session)
    expect(result.session.revision).toBe(0)
  })

  it('treats ok:true without both states as rejection', () => {
    const buggyNeither: ActionValidator<TPublicState, TPrivateState, TAction> = () => ({
      ok: true,
    })

    const session = createHostSession<TPublicState, TPrivateState>(
      { turn: 'p1' },
      { p1: { hand: ['c1'] }, p2: { hand: ['c2'] } },
    )

    const result = applyAction(session, 'p1', { type: 'DRAW' }, buggyNeither)
    expect(result.outcome.ok).toBe(false)
    expect(result.outcome.reason).toBe('validator returned ok without state')
    expect(result.session).toBe(session)
    expect(result.session.revision).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// applyAction — validator privateStates shape
// ---------------------------------------------------------------------------

describe('applyAction — validator privateStates shape', () => {
  it('rejects ok:true with privateStates: null', () => {
    // Deliberately probing a validator that lies about its own return type:
    // null is not normally assignable to privateStates, hence the `as any`.
    const lyingValidator: ActionValidator<TPublicState, TPrivateState, TAction> = () =>
      ({
        ok: true,
        publicState: { turn: 'p2' },
        privateStates: null,
      }) as any

    const session = createHostSession<TPublicState, TPrivateState>(
      { turn: 'p1' },
      { p1: { hand: ['c1'] }, p2: { hand: ['c2'] } },
    )

    const result = applyAction(session, 'p1', { type: 'DRAW' }, lyingValidator)

    expect(result.outcome.ok).toBe(false)
    expect(result.outcome.reason).toBe('validator returned ok without state')
    expect(result.session).toBe(session)
    expect(result.session.revision).toBe(0)
  })

  it('rejects a privateStates map that drops an existing player', () => {
    const dropsBob: ActionValidator<TPublicState, TPrivateState, TAction> = () =>
      ({
        ok: true,
        publicState: { turn: 'p2' },
        privateStates: { alice: { hand: ['c1'] } },
      }) as any

    const session = createHostSession<TPublicState, TPrivateState>(
      { turn: 'p1' },
      {
        alice: { hand: ['c1'] },
        bob: { hand: ['bob-secret'] },
      },
    )

    const result = applyAction(session, 'alice', { type: 'DRAW' }, dropsBob)

    expect(result.outcome.ok).toBe(false)
    expect(result.outcome.reason).toBe('validator returned ok without state')
    expect(result.session).toBe(session)
    expect(result.session.revision).toBe(0)
    expect(result.session.privateStates.bob).toEqual({ hand: ['bob-secret'] })
  })

  it('accepts a privateStates map that adds a new player', () => {
    const addsBob: ActionValidator<TPublicState, TPrivateState, TAction> = () => ({
      ok: true,
      publicState: { turn: 'p2' },
      privateStates: {
        alice: { hand: ['c1', 'c3'] },
        bob: { hand: ['c2'] },
      },
    })

    const session = createHostSession<TPublicState, TPrivateState>(
      { turn: 'p1' },
      { alice: { hand: ['c1'] } },
    )

    const result = applyAction(session, 'alice', { type: 'DRAW' }, addsBob)

    expect(result.outcome.ok).toBe(true)
    expect(result.session.revision).toBe(1)
    expect(result.session.privateStates).toEqual({
      alice: { hand: ['c1', 'c3'] },
      bob: { hand: ['c2'] },
    })
  })
})

// ---------------------------------------------------------------------------
// applyAction — two-player both-sides mutation
// ---------------------------------------------------------------------------

describe('applyAction — two-player both-sides mutation', () => {
  it('threads through full privateStates map when both players changed', () => {
    const moveBoth: ActionValidator<TPublicState, TPrivateState, TAction> = (
      _session,
      _playerId,
      _action,
    ) => ({
      ok: true,
      publicState: { turn: 'p2' },
      privateStates: {
        p1: { hand: ['c1', 'c3'] },
        p2: { hand: ['c2'] },
      },
    })

    const session = createHostSession<TPublicState, TPrivateState>(
      { turn: 'p1' },
      { p1: { hand: ['c1'] }, p2: { hand: ['c2', 'c3'] } },
    )

    const result = applyAction(session, 'p1', { type: 'DISCARD', card: 'c1' }, moveBoth)

    expect(result.outcome.ok).toBe(true)
    expect(result.session.revision).toBe(1)
    expect(result.session.privateStates).toEqual({
      p1: { hand: ['c1', 'c3'] },
      p2: { hand: ['c2'] },
    })
  })
})

// ---------------------------------------------------------------------------
// deriveSnapshot — hidden information
// ---------------------------------------------------------------------------

describe('deriveSnapshot — hidden information', () => {
  it('returns only the requested players private state', () => {
    const session: HostSession<TPublicState, TPrivateState> = {
      revision: 3,
      publicState: { turn: 'p1' },
      privateStates: {
        p1: { hand: ['c1', 'c3'] },
        p2: { hand: ['secret-p2-card'] },
      },
    }

    const snapshot = deriveSnapshot(session, 'p1')

    expect(snapshot.kind).toBe('snapshot')
    expect(snapshot.revision).toBe(3)
    expect(snapshot.publicState).toEqual({ turn: 'p1' })
    expect(snapshot.privateState).toEqual({ hand: ['c1', 'c3'] })
  })

  it('does not leak other players private data in JSON', () => {
    const session: HostSession<TPublicState, TPrivateState> = {
      revision: 2,
      publicState: { turn: 'p2' },
      privateStates: {
        p1: { hand: ['alice-card-a'] },
        p2: { hand: ['bob-secret-x'] },
      },
    }

    const snapshot = deriveSnapshot(session, 'p1')
    const serialized = JSON.stringify(snapshot)

    expect(serialized).not.toContain('bob-secret-x')
    expect(serialized).toContain('alice-card-a')
  })

  it('does not leak built-in Object prototype properties as privateState', () => {
    const session: HostSession<TPublicState, TPrivateState> = {
      revision: 2,
      publicState: { turn: 'p1' },
      privateStates: {
        p1: { hand: ['c1'] },
        p2: { hand: ['c2'] },
      },
    }

    for (const id of ['constructor', 'toString', '__proto__']) {
      const snapshot = deriveSnapshot(session, id)
      expect(snapshot.privateState).toBeUndefined()
      expect(typeof snapshot.privateState).not.toBe('function')
    }
  })
})

// ---------------------------------------------------------------------------
// deriveSnapshot — reconnect snapshot
// ---------------------------------------------------------------------------

describe('deriveSnapshot — reconnect snapshot', () => {
  it('same session, different players: shared revision/publicState, distinct privateState', () => {
    const session: HostSession<TPublicState, TPrivateState> = {
      revision: 4,
      publicState: { turn: 'p1' },
      privateStates: {
        p1: { hand: ['c1'] },
        p2: { hand: ['c2', 'c4'] },
      },
    }

    const snap1 = deriveSnapshot(session, 'p1')
    const snap2 = deriveSnapshot(session, 'p2')

    // Shared: revision and publicState are identical
    expect(snap1.revision).toBe(4)
    expect(snap2.revision).toBe(4)
    expect(snap1.publicState).toEqual({ turn: 'p1' })
    expect(snap2.publicState).toEqual({ turn: 'p1' })

    // Different: privateState is each player's own
    expect(snap1.privateState).toEqual({ hand: ['c1'] })
    expect(snap2.privateState).toEqual({ hand: ['c2', 'c4'] })
  })
})

// ---------------------------------------------------------------------------
// shouldAcceptUpdate
// ---------------------------------------------------------------------------

describe('shouldAcceptUpdate', () => {
  it('(5, 6) → true (newer accepted)', () => {
    expect(shouldAcceptUpdate(5, 6)).toBe(true)
  })

  it('(5, 5) → false (duplicate/replay rejected)', () => {
    expect(shouldAcceptUpdate(5, 5)).toBe(false)
  })

  it('(5, 3) → false (older/stale rejected)', () => {
    expect(shouldAcceptUpdate(5, 3)).toBe(false)
  })

  it('(0, 1) → true (first real update after initial revision 0)', () => {
    expect(shouldAcceptUpdate(0, 1)).toBe(true)
  })

  it('(0, 0) → false (duplicate of initial)', () => {
    expect(shouldAcceptUpdate(0, 0)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// isJsonSerializable
// ---------------------------------------------------------------------------

describe('isJsonSerializable', () => {
  // True cases
  it('returns true for null', () => {
    expect(isJsonSerializable(null)).toBe(true)
  })

  it('returns true for string', () => {
    expect(isJsonSerializable('hello')).toBe(true)
  })

  it('returns true for number', () => {
    expect(isJsonSerializable(42)).toBe(true)
  })

  it('returns true for boolean', () => {
    expect(isJsonSerializable(true)).toBe(true)
    expect(isJsonSerializable(false)).toBe(true)
  })

  it('rejects NaN', () => {
    expect(isJsonSerializable(NaN)).toBe(false)
  })

  it('rejects Infinity and -Infinity', () => {
    expect(isJsonSerializable(Infinity)).toBe(false)
    expect(isJsonSerializable(-Infinity)).toBe(false)
  })

  it('rejects a nested NaN', () => {
    expect(isJsonSerializable({ a: NaN })).toBe(false)
  })

  it('returns true for plain empty object', () => {
    expect(isJsonSerializable({})).toBe(true)
  })

  it('returns true for plain nested object', () => {
    expect(isJsonSerializable({ a: { b: { c: 1 } } })).toBe(true)
  })

  it('returns true for empty array', () => {
    expect(isJsonSerializable([])).toBe(true)
  })

  it('returns true for array of primitives', () => {
    expect(isJsonSerializable([1, 'two', false, null])).toBe(true)
  })

  it('returns true for realistic card-shaped object', () => {
    const card = { id: 'c1', suit: 'clubs', rank: 'A' }
    expect(isJsonSerializable(card)).toBe(true)
  })

  it('returns true for array of card-shaped objects', () => {
    const hand = [
      { id: 'c1', suit: 'clubs', rank: 'A' },
      { id: 'c2', suit: 'hearts', rank: 'K' },
    ]
    expect(isJsonSerializable(hand)).toBe(true)
  })

  it('returns true for object with null prototype', () => {
    expect(isJsonSerializable(Object.create(null))).toBe(true)
  })

  it('returns true for a genuine plain array literal (not a subclass)', () => {
    expect(isJsonSerializable([1, 2, { a: 'b' }])).toBe(true)
  })

  // False cases
  it('returns false for undefined', () => {
    expect(isJsonSerializable(undefined)).toBe(false)
  })

  it('returns false for function', () => {
    expect(isJsonSerializable(() => {})).toBe(false)
  })

  it('returns false for symbol', () => {
    expect(isJsonSerializable(Symbol('test'))).toBe(false)
  })

  it('returns false for bigint', () => {
    expect(isJsonSerializable(BigInt(123))).toBe(false)
  })

  it('returns false for Date instance', () => {
    expect(isJsonSerializable(new Date())).toBe(false)
  })

  it('returns false for Map instance', () => {
    expect(isJsonSerializable(new Map([['a', 1]]))).toBe(false)
  })

  it('returns false for Set instance', () => {
    expect(isJsonSerializable(new Set([1, 2, 3]))).toBe(false)
  })

  it('returns false for class instance with plain-data fields', () => {
    class Foo {
      x = 1
      y = 'hello'
    }
    expect(isJsonSerializable(new Foo())).toBe(false)
  })

  it('returns false for object containing a function', () => {
    expect(isJsonSerializable({ fn: () => {} })).toBe(false)
  })

  it('returns false for array containing a function', () => {
    expect(isJsonSerializable([1, () => {}, 3])).toBe(false)
  })

  it('returns false for deeply nested undefined', () => {
    expect(isJsonSerializable({ a: { b: { c: undefined } } })).toBe(false)
  })

  it('returns false for deeply nested function', () => {
    expect(isJsonSerializable({ a: { b: { c: () => {} } } })).toBe(false)
  })

  it('returns false for a self-referential object without throwing', () => {
    const o: any = { a: 1 }
    o.self = o

    expect(() => isJsonSerializable(o)).not.toThrow()
    expect(isJsonSerializable(o)).toBe(false)
  })

  it('returns false for a circular reference nested in a realistic shape', () => {
    const obj: any = { hand: [{ id: 'c1', owner: null }] }
    obj.hand[0].owner = obj

    expect(isJsonSerializable(obj)).toBe(false)
  })

  it('returns false for an instance of a class extending Array', () => {
    class MyHand extends Array {}
    const h = new MyHand()
    h.push('a', 'b')

    expect(isJsonSerializable(h)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// assertWireSafe
// ---------------------------------------------------------------------------

describe('assertWireSafe', () => {
  it('does not throw for a plain nested object (RummyView-shaped)', () => {
    const view = { revision: 3, publicState: { a: 1 }, privateState: { hand: ['c1'] }, opponentName: 'Bob' }
    expect(() => assertWireSafe(view, 'HostHandle.broadcast')).not.toThrow()
  })

  it('throws for a payload containing a function', () => {
    expect(() => assertWireSafe({ a: { fn: () => {} } }, 'HostHandle.broadcast')).toThrow()
  })

  it('throws for a payload containing a Map', () => {
    expect(() => assertWireSafe({ a: new Map([['k', 1]]) }, 'HostHandle.broadcast')).toThrow()
  })

  it('throws for a payload containing a class instance', () => {
    class Foo {
      x = 1
    }
    expect(() => assertWireSafe({ a: new Foo() }, 'HostHandle.broadcast')).toThrow()
  })

  it('throws for a payload containing nested undefined', () => {
    expect(() => assertWireSafe({ a: { b: undefined } }, 'HostHandle.broadcast')).toThrow()
  })

  it('throws for a payload containing NaN', () => {
    expect(() => assertWireSafe({ score: NaN }, 'HostHandle.broadcast')).toThrow()
  })

  it('includes the provided context string in the thrown message', () => {
    expect(() => assertWireSafe({ fn: () => {} }, 'HostHandle.broadcast')).toThrow('HostHandle.broadcast')
    expect(() => assertWireSafe({ fn: () => {} }, 'GuestHandle.sendAction')).toThrow('GuestHandle.sendAction')
  })
})
