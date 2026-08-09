# Charter: Connect 4

**Mode:** directed
**Started:** 2026-08-08
**Pre-approved:** yes — user invoked `/autonomous-dev-loop` + `/model-routing`
with "Ask me no questions — completely autonomous from here until the end,
when you can request audio from me." The only permitted end-of-run ask is the
real audio asset(s).

**Delegation:** per `/model-routing`. Live-probed at charter start — Codex is
back (quota reset since the deal-intro charter; probe returned OK). So:
implementation + tests → `codex exec` (terra@low default); adversarial review
→ `claude --model sonnet --effort medium`; spec authoring + loop driving +
verification → this session (the session model *is* Fable, the designated
spec-author tier, so no external `claude --model fable` call is needed — the
lead authors specs directly and logs any deviation).

**Working branch:** `main`, directly — matching this session's established
pattern of landing each verified slice as one commit on `main`. No push
without explicit user say-so (standing REQUESTS.md item).

## Design source

`Design Handoff/CONNECT4.md`, plus the fully-working reference implementation
in `Design Handoff/Pips.dc.html` (lines ~332–384 markup, ~1303–1399 logic).
The handoff says: port the rules, not necessarily the code.

## Architecture decision (locked)

Connect 4 joins the **older game system** — `src/games/` pure logic +
`src/state/room.ts` host-authoritative reducer + a `src/screens/` table —
exactly like Tic Tac Toe, its closest sibling (same first-to-three match
shape, same turn model). It does **not** touch `src/card-engine/` or
`src/card-games/`. State is plain serializable data over PeerJS; the host
validates every move; clients only submit intents and render.

## Target user
A Pips player (host-vs-bot or host-vs-guest over a room code) who wants a
quick Connect 4 match from the same shelf as the other games.

## Core use case
Pick Connect 4 on the landing shelf (or in the room game picker), share the
code or play the house, click a column to drop a disc, watch it land in the
lowest open slot with hover preview on your turn, first to three game wins
takes the match — with the same look, header, sounds, and results flow as
every other Pips game.

## Non-goals
- **No drag, no undo, no animation of the disc falling** — the handoff
  specifies click-to-drop only; discs appear in place (radial-gradient
  bevel per the visual spec), no falling animation is described.
- **No difficulty levels for the bot.** The handoff defines exactly one bot
  policy (win / block / center-out-safe). TTT and Hangman likewise ignore
  `botDifficulty`; Connect 4 does the same.
- **>2 players** — inherently two-player, like TTT.
- **Networked hover preview.** The prototype keeps `c4HoverCol` in its
  single-client state; in the real app hover is per-client UI state local to
  the table screen. It never crosses PeerJS.
- **New real audio.** A disc-drop sound doesn't exist in the asset set; per
  the user's instruction a *placeholder* (`piece-drop.mp3`, a copy of the
  existing `mark-place.mp3` so it's audible and valid) ships now, and the
  real asset is requested from the user at wrap-up. `round-win` and
  `game-win` already exist and already fire via the established patterns.
- **Automated DOM tests** — no jsdom in the project; rendered behavior is
  live-verified in a real browser (established practice). Pure logic
  (rules, bot, reducer) is vitest-tested.

## Header note
The handoff asks for the Pips-wordmark header on the Connect 4 table and its
rollout to the other tables "for consistency". That rollout **already
happened** in a prior charter — `TableHeader.tsx` renders `Wordmark` as a
back-to-landing button and every table uses it. Connect 4 simply uses the
existing `TableHeader`. Nothing to roll out.

## Milestones
- M1: rules + state — `src/games/connect4.ts` (+`connect4.test.ts`):
  `lowestOpenRow`, `checkWin`, `isBoardFull`, `decideConnect4Move`;
  `src/types.ts` (Game union + records + `Connect4State` + actions);
  `src/state/room.ts` (init, `connect4Play`, `connect4AdvanceRound`,
  startGame/withNewSeats wiring) + `room.test.ts` coverage.
- M2: UI + app wiring — `src/screens/Connect4Table.tsx` (tray, sockets,
  beveled discs, hover preview, win ring, seat score cards, sounds),
  `App.tsx` (route, `whoActsNow`, bot runner, round-pause advance),
  `Landing.tsx`/`Room.tsx` shelf entries, `rules.ts` entry, `tokens.css`
  (`--blue: #2f6fed`, `--connect4-color`), `useSound.ts` + placeholder
  `piece-drop.mp3`.
- M3: live browser verification of a full host-vs-bot match (win, draw-replay
  if reachable, hover preview, sounds, results/rematch), review findings
  fixed, docs/state files current.

## Definition of done
- Connect 4 appears on the shelf and in the room picker; a full
  host-vs-bot match plays to results and rematch works — live-verified in a
  real browser.
- Rules, win detection (all four directions), draw-replay, starter
  alternation, and bot policy match the handoff, unit-tested.
- Guest-side flow is code-reviewed for host-authority (no host-only state
  mutated client-side); guest actions validated host-side.
- `npx tsc -b --noEmit`, `npm test`, `npm run build` clean throughout.
- Placeholder `piece-drop.mp3` in place; real audio requested at wrap-up.

## Run budget
6 cycles (expect 2–3). On exhaustion: land in-flight work, clean tree,
cancel the safety net, request renewal.

## Stop criteria
- Stop when the definition of done is met.
- Any milestone unresolved after 3 cycles forces a pivot/pause decision.

## Ambiguity resolutions
1. **Board orientation** — flat 42-cell array, row-major, row 0 = top,
   exactly as the prototype (`c4Board[row*7+col]`), cell = seat index or
   `null`. Drop fills the highest index (bottom-most) open row.
2. **Win-line highlight extent** — the full contiguous run through the
   dropped disc (may exceed 4), matching the prototype's `c4Check`.
3. **State shape** — mirrors `TttState` (`board`, `starter`, `winLine`,
   `over`, `roundOver`, `pendingWinnerId`, `wins`) so the round-pause →
   advance flow in `App.tsx` is the same code shape as TTT's. Status text is
   derived in the screen, not stored.
4. **Match length** — first to **three** games (handoff), pause
   `ROUND_PAUSE_MS` on round end with the winning line highlighted, then
   host auto-advances (`connect4AdvanceRound`), like TTT.
5. **Sounds** — `piece-drop` on your own placement only (TTT's
   diff-signature pattern, to avoid bot spam), `round-win` on round end,
   `game-win` via the existing shared `Results.tsx`.
6. **Bot's "safer column" rule** — implemented exactly as the prototype:
   among center-out-preferred open columns, keep those whose drop does not
   give the opponent an immediate win anywhere next turn; pick the first
   survivor, else the first preferred open column.
7. **Draw** — full board, no line: replay, nobody scores, starter still
   alternates (prototype behavior).
