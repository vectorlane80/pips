# Charter: Battleship rule variants

**Mode:** directed
**Started:** 2026-08-09
**Pre-approved:** yes — user: three fire modes, settable by the host on
game start: "Standard turn-based" (current), "Make it, take it" (your turn
continues until you miss), "Free-For-All" (no turns at all, race to the
death). Same loop + routing as the Battleship charter (deepseek:flash
implements, sonnet reviews, no Codex).

## Design decisions (locked)

- `BattleshipVariant = 'standard' | 'streak' | 'free'`; UI labels
  "Standard turn-based" / "Make it, take it" / "Free-for-all".
- Variant lives in `BattleshipPublicState` (serializable; guest renders
  correct chrome). `createBattleshipGame(playerIds, seed, variant = 'standard')`
  — default keeps every existing test and call site valid.
- Validator FIRE:
  - turn check skipped entirely when `free`;
  - turn update: standard → `advanceTurn`; streak → hit/sunk ? `extraTurn`
    : `advanceTurn`; free → `extraTurn` always (turnNumber doubles as a
    shot counter, which also feeds the bot staleness key and sound sig).
- Bot strategy needs NO variant awareness (hunt/target is mode-independent);
  the App bot loop changes its gate: free → fire every BASE_MS while stage
  is 'battle'; otherwise → fire when `currentPlayer === 'bot'`. Streak
  works through the existing loop unchanged (after a bot hit it is still
  the bot's turn, so the loop re-fires).
- Host picks the variant in BattleshipRoom (segmented options with
  one-line descriptions) BEFORE the guest joins or the house bot is added;
  App holds `battleshipVariant` state+ref; session creation reads the ref.
  Rematch reuses `publicState.variant` from the finished session (not the
  picker — source of truth is the match being replayed).
- In free mode both players may fire simultaneously; the host serializes
  actions, the first all-sunk FIRE wins, later shots bounce off stage
  'over'. Ties are impossible by construction.
- Hidden-info contract unchanged and re-reviewed (variant adds no new
  public data beyond the enum).

## Non-goals
- No new bot difficulty/pacing knobs (free-mode bot fires at BASE_MS).
- No variant picker on the guest side or mid-match variant switching.
- No changes to scoring, reveals, or placement.

## Milestones
- M1: module — types, validator turn logic, tests per variant (streak
  keep/pass, free out-of-turn + interleave + termination, standard
  regression untouched). Spec 15.
- M2: Room picker + App wiring (state/ref, bot-loop gate, rematch) +
  Table chrome per variant (chip/status/hint) + rules-overlay bullet.
  Spec 15b.
- M3: live browser verification of streak and free vs bot, review of the
  full diff, docs, state files.

## Definition of done
- All three variants playable host-vs-bot in the browser; streak visibly
  chains on hits (both sides), free visibly turnless (both fire freely).
- tsc/tests/build green; review clean; docs updated; commit offered.

## Run budget
6 cycles (expect 1–2).
