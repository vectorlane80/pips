# Spec 19: route module (M1 — pure logic + tests)

Create exactly `src/state/route.ts` and `src/state/route.test.ts`.
No React, no history calls — pure functions + one cookie pair.

## route.ts

```ts
// Path segment per game, used as /pips/<segment>. Engine + legacy alike.
export type RoutedGame = 'farkle' | 'yahtzee' | 'ttt' | 'hangman'
  | 'connect4' | 'rummy' | 'phase10' | 'battleship' | 'dominoes' | 'wahoo'
export const GAME_SEGMENTS: Record<RoutedGame, string>  // identity map is fine
export function gamePath(game: RoutedGame): string       // `/pips/${segment}`
export function gameFromPath(pathname: string): RoutedGame | null
// tolerant: leading/trailing slashes, with or without the /pips base
// (GH Pages serves /pips/wahoo; dev may serve /wahoo after base strip —
// accept both), unknown segment -> null

export type BootAction =
  | { kind: 'shelf' }
  | { kind: 'join'; code: string }              // ?join=CODE (existing flow)
  | { kind: 'host'; game: RoutedGame }          // deep link with a name
  | { kind: 'shelf-needs-name'; game: RoutedGame } // deep link, no name

export function decideBoot(pathname: string, search: string, hasName: boolean): BootAction
// precedence: ?join= wins over the path; then game path (host if
// hasName else shelf-needs-name); else shelf.

export function readNameCookie(): string | null   // 'pips-name'
export function writeNameCookie(name: string): void
// max-age 31536000, path=/, samesite=lax — same idiom as pips-sound in
// useSound.ts (read it for the exact pattern). Trimmed; empty -> no-op.
```

## route.test.ts

- gameFromPath: '/pips/wahoo', 'pips/wahoo/', '/wahoo', '/pips/',
  '/pips', '/', '/pips/nope' → expected results; every RoutedGame round-
  trips through gamePath→gameFromPath.
- decideBoot: join beats path; host vs shelf-needs-name on hasName;
  plain shelf; join code passthrough verbatim (case preserved).
- Cookie helpers: write→read round-trip (document.cookie works in the
  vitest environment? If the environment lacks DOM, guard: make the
  cookie fns take an optional cookie-string accessor injectable for
  tests, defaulting to document.cookie — test the pure serialization
  via the injectable seam WITHOUT jsdom).

Verify: npx tsc -b --noEmit; npm test (674 + new); npm run build.
Forbidden: touching App/screens; router deps; git.
Report tallies + deviations.
