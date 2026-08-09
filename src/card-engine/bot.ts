import type { ActionOutcome, ActionValidator, HostSession } from '../engine/sync.ts'
import { applyAction, deriveSnapshot } from '../engine/sync.ts'

export type BotStrategy<TPublicState, TPrivateState, TAction> = (
  publicState: TPublicState,
  privateState: TPrivateState,
  playerId: string,
) => TAction

export function runBotTurn<TPublicState, TPrivateState, TAction>(
  session: HostSession<TPublicState, TPrivateState>,
  playerId: string,
  strategy: BotStrategy<TPublicState, TPrivateState, TAction>,
  validate: ActionValidator<TPublicState, TPrivateState, TAction>,
): { session: HostSession<TPublicState, TPrivateState>; outcome: ActionOutcome<TPublicState, TPrivateState> } {
  const view = deriveSnapshot(session, playerId)
  if (view.privateState === undefined) {
    throw new Error(`runBotTurn: playerId "${playerId}" is not a participant in this session`)
  }
  const action = strategy(view.publicState, view.privateState, playerId)
  return applyAction(session, playerId, action, validate)
}
