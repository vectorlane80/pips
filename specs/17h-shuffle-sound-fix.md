# Spec 17h: single dominoes shuffle sound (review finding)

DealIntro internally plays the card 'shuffle' sound at its shuffle phase,
and DominoesTable ALSO plays 'domino-shuffle' on intro start — both layer
audibly every round. Lead decision: DealIntro gains an optional prop, and
dominoes uses it; the card games keep their behavior with zero changes.

1. `src/components/DealIntro.tsx`: add an optional prop
   `shuffleSound?: SoundName` (import the type from '../hooks/useSound'),
   default `'shuffle'`. The internal `playRef.current('shuffle')` call
   becomes `playRef.current(shuffleSound)` (freeze it alongside the other
   mount-frozen values so a mid-intro prop change can't retrigger).
   No other behavior changes; Rummy/Phase 10 call sites untouched and
   unaffected (default preserves them exactly).
2. `src/screens/DominoesTable.tsx`: pass `shuffleSound="domino-shuffle"`
   to DealIntro and DELETE the table's own `play('domino-shuffle')` call
   in the roundNumber intro effect (DealIntro's phase timing is the
   single source of the sound now).

Verify: `npx tsc -b --noEmit`, `npm test` (597), `npm run build`.
Forbidden: anything beyond those two files. Report tallies + deviations.
