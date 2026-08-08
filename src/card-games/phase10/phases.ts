export type PhasePartType = 'set' | 'run' | 'color'

export interface PhasePart {
  type: PhasePartType
  count: number
}

export interface PhaseRequirement {
  phase: number       // 1-10
  label: string        // exact wording below, for UI display
  parts: PhasePart[]   // 1 or 2 parts
}

export const PHASES: PhaseRequirement[] = [
  { phase: 1, label: '2 sets of 3', parts: [{ type: 'set', count: 3 }, { type: 'set', count: 3 }] },
  { phase: 2, label: '1 set of 3 + 1 run of 4', parts: [{ type: 'set', count: 3 }, { type: 'run', count: 4 }] },
  { phase: 3, label: '1 set of 4 + 1 run of 4', parts: [{ type: 'set', count: 4 }, { type: 'run', count: 4 }] },
  { phase: 4, label: '1 run of 7', parts: [{ type: 'run', count: 7 }] },
  { phase: 5, label: '1 run of 8', parts: [{ type: 'run', count: 8 }] },
  { phase: 6, label: '1 run of 9', parts: [{ type: 'run', count: 9 }] },
  { phase: 7, label: '2 sets of 4', parts: [{ type: 'set', count: 4 }, { type: 'set', count: 4 }] },
  { phase: 8, label: '7 cards of one color', parts: [{ type: 'color', count: 7 }] },
  { phase: 9, label: '1 set of 5 + 1 set of 2', parts: [{ type: 'set', count: 5 }, { type: 'set', count: 2 }] },
  { phase: 10, label: '1 set of 5 + 1 set of 3', parts: [{ type: 'set', count: 5 }, { type: 'set', count: 3 }] },
]
