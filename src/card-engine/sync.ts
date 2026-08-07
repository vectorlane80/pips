export interface HostSession<TPublicState, TPrivateState> {
  revision: number
  publicState: TPublicState
  privateStates: Record<string, TPrivateState>
}

export interface SnapshotMessage<TPublicState, TPrivateState> {
  kind: 'snapshot'
  revision: number
  publicState: TPublicState
  privateState: TPrivateState
}

export interface ActionOutcome<TPublicState, TPrivateState> {
  ok: boolean
  reason?: string
  publicState?: TPublicState
  privateStates?: Record<string, TPrivateState>
}

export type ActionValidator<TPublicState, TPrivateState, TAction> = (
  session: HostSession<TPublicState, TPrivateState>,
  playerId: string,
  action: TAction,
) => ActionOutcome<TPublicState, TPrivateState>

export function createHostSession<TPublicState, TPrivateState>(
  publicState: TPublicState,
  privateStates: Record<string, TPrivateState>,
): HostSession<TPublicState, TPrivateState> {
  return { revision: 0, publicState, privateStates }
}

export function applyAction<TPublicState, TPrivateState, TAction>(
  session: HostSession<TPublicState, TPrivateState>,
  playerId: string,
  action: TAction,
  validate: ActionValidator<TPublicState, TPrivateState, TAction>,
): { session: HostSession<TPublicState, TPrivateState>; outcome: ActionOutcome<TPublicState, TPrivateState> } {
  const outcome = validate(session, playerId, action)

  const hasValidState =
    outcome.ok &&
    outcome.publicState != null &&
    outcome.privateStates != null &&
    Object.keys(session.privateStates).every((existingPlayerId) =>
      Object.hasOwn(outcome.privateStates!, existingPlayerId),
    )

  if (!hasValidState) {
    return {
      session,
      outcome: { ok: false, reason: outcome.ok ? 'validator returned ok without state' : outcome.reason },
    }
  }
  return {
    session: {
      revision: session.revision + 1,
      publicState: outcome.publicState!,
      privateStates: outcome.privateStates!,
    },
    outcome,
  }
}

export function deriveSnapshot<TPublicState, TPrivateState>(
  session: HostSession<TPublicState, TPrivateState>,
  playerId: string,
): SnapshotMessage<TPublicState, TPrivateState> {
  return {
    kind: 'snapshot',
    revision: session.revision,
    publicState: session.publicState,
    privateState: Object.hasOwn(session.privateStates, playerId)
      ? session.privateStates[playerId]
      : undefined as TPrivateState,
  }
}

// A client's initial "local revision" sentinel MUST be a value strictly less than any real
// revision a session can have — use -1, not 0. `createHostSession` starts real sessions at
// revision 0, so a client that (incorrectly) initializes its own tracked revision to 0 will
// discard the very first snapshot it ever receives (shouldAcceptUpdate(0, 0) is false, by
// design — a non-newer revision is correctly treated as not-newer). This is intentional
// behavior, not a bug in this function; it's a contract every caller must know.
export function shouldAcceptUpdate(localRevision: number, incomingRevision: number): boolean {
  return incomingRevision > localRevision
}

export function isJsonSerializable(value: unknown, seen: Set<object> = new Set()): boolean {
  if (value === null) return true
  const t = typeof value
  if (t === 'string' || t === 'number' || t === 'boolean') return true
  if (t === 'undefined' || t === 'function' || t === 'symbol' || t === 'bigint') return false
  if (t === 'object') {
    const obj = value as object
    if (seen.has(obj)) return false
    seen.add(obj)
    if (Array.isArray(value)) {
      if (Object.getPrototypeOf(value) !== Array.prototype) return false
      return value.every((v) => isJsonSerializable(v, seen))
    }
    const proto = Object.getPrototypeOf(value)
    if (proto !== Object.prototype && proto !== null) return false
    return Object.values(value as Record<string, unknown>).every((v) => isJsonSerializable(v, seen))
  }
  return false
}
