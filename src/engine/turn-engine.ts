export type TurnDirection = 1 | -1

export interface TurnState<Phase extends string = string> {
  playerOrder: string[]
  currentIndex: number
  direction: TurnDirection
  phase: Phase
  turnNumber: number
}

export function createTurnState<Phase extends string>(
  playerOrder: string[],
  initialPhase: Phase,
): TurnState<Phase> {
  return {
    playerOrder: [...playerOrder],
    currentIndex: 0,
    direction: 1,
    phase: initialPhase,
    turnNumber: 1,
  }
}

export function currentPlayer<Phase extends string>(state: TurnState<Phase>): string {
  return state.playerOrder[state.currentIndex]
}

export function advanceTurn<Phase extends string>(
  state: TurnState<Phase>,
  nextPhase: Phase,
): TurnState<Phase> {
  const len = state.playerOrder.length
  const nextIndex = ((state.currentIndex + state.direction) % len + len) % len
  return {
    playerOrder: state.playerOrder,
    currentIndex: nextIndex,
    direction: state.direction,
    phase: nextPhase,
    turnNumber: state.turnNumber + 1,
  }
}

export function skipNext<Phase extends string>(
  state: TurnState<Phase>,
  nextPhase: Phase,
): TurnState<Phase> {
  const len = state.playerOrder.length
  const nextIndex = ((state.currentIndex + state.direction * 2) % len + len) % len
  return {
    playerOrder: state.playerOrder,
    currentIndex: nextIndex,
    direction: state.direction,
    phase: nextPhase,
    turnNumber: state.turnNumber + 1,
  }
}

export function extraTurn<Phase extends string>(
  state: TurnState<Phase>,
  nextPhase: Phase,
): TurnState<Phase> {
  return {
    playerOrder: state.playerOrder,
    currentIndex: state.currentIndex,
    direction: state.direction,
    phase: nextPhase,
    turnNumber: state.turnNumber + 1,
  }
}

export function reverseDirection<Phase extends string>(
  state: TurnState<Phase>,
): TurnState<Phase> {
  const flipped: TurnDirection = state.direction === 1 ? -1 : 1
  return {
    playerOrder: state.playerOrder,
    currentIndex: state.currentIndex,
    direction: flipped,
    phase: state.phase,
    turnNumber: state.turnNumber,
  }
}

export function setPhase<Phase extends string>(
  state: TurnState<Phase>,
  phase: Phase,
): TurnState<Phase> {
  return {
    playerOrder: state.playerOrder,
    currentIndex: state.currentIndex,
    direction: state.direction,
    phase,
    turnNumber: state.turnNumber,
  }
}
