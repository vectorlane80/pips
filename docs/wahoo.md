# Wahoo

The first MULTI-SEAT game on the engine core (2–4 players), and the
salvage of a design handoff whose board geometry didn't survive contact
with reality. The state model (the handoff's one great decision) is pure
distances; the board is generated, not drawn.

## Where things live

```
src/board-games/wahoo/
  board.ts        One quadrant (13 track holes, lane, base) rotated ×4 —
                  52-hole cross with provable symmetry/connectivity
  state.ts        Distance model (-1 base, -2 center, 0..51 track rel.
                  to own entry, 52..55 lane), legalMoves generator
  rules.ts        ROLL/MOVE validator (host-rng die), six chains,
                  triple-six bust, center bookkeeping
  bot.ts          Deterministic priority strategy
  *.test.ts + oscar.test.ts (24 adversarial probes)

src/screens/Wahoo{Room,Table,Results,RulesOverlay}.tsx (+ css)
App wiring: WH- codes, pre-game lobby broadcast, up to 3 guests,
host-gated Start at 2–4 seats, per-seat bot loop, replace-dropped-
guest-with-bot, late joins rejected ("Game in progress — spectating
comes later."). This wiring is the TEMPLATE for lifting the 2-player
cap on the other engine games.
```

## Rules as shipped (user-approved)

Single die; 1/6 brings a marble out; exact counts; landing on an
opponent bumps them to base; never on your own marble. Home lane fills
back-to-front, exact counts, no self-jumping; all four home wins
immediately. A 6 rolls again — three 6s in a row send the last-moved
marble home. No legal move auto-passes (a moveless 6 does not extend
the chain). Center shortcut: sits one step past a corner — enter with an
exact roll through one of YOUR two forward corners (relative 12/25;
38/51 would exit backward and are never offered), stop-only with bump,
exit on 1/6 to the DIAGONALLY OPPOSITE corner. 2P opposite arms, 3P
random three (fourth muted), 4P all; colors randomly assigned. No score
pills — the legend carries home/base counts.

## UI notes

Destination-click targets computed from legalMoves; when two legal moves
share a destination hole (provably possible — advance vs center exit
onto the same corner), the target renders "contested" and a marble-first
selection disambiguates. Sounds reuse dice-roll / piece-drop /
farkle-bust pending real assets.

## Verification history (2026-08-09)

board.test.ts proves 52 unique holes, 48+4 step lengths, per-hole
four-fold symmetry, corner pairing 26 apart. Module review CLEAN (22
probes: wrap-seam collisions, six-chain leaks, lane privacy, forged
moves). Wiring review: approve after fixing the destination-collision
gap + two ref nits; systemic peer.ts notes (reject doesn't close the
connection; a reconnecting peer with a known old id could act for a
bot-replaced seat) filed in REQUESTS.md for a cross-game pass. Live:
4-seat host+bots game — correct board rendered, room gating (Start at
2–4, Add-bot cap), roll/target/move, out on 6, extra turn on 6,
auto-pass, bot turn rotation, and a second-tab late join rejected with
the exact message. Full-game/bump/center/win paths covered by 2/3/4-seat
bot-vs-bot sims in the suite.
