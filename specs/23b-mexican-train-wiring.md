# Spec 23b — Mexican Train wiring: App, route, landing

You own edits to EXACTLY these files (no new files):

- `src/App.tsx`
- `src/state/route.ts`
- `src/state/route.test.ts`
- `src/screens/Landing.tsx`
- `src/net/peer.ts` (ONE addition, below — nothing else changes)

Mexican Train is a 4-seat engine game wired EXACTLY like Wahoo (the
multi-seat sibling): grep App.tsx for `wahoo`/`Wahoo`/`WH-` and mirror
EVERY site (imports, view type with lobby|game kinds, state + refs, host
create with multi-guest lobby broadcast + spectator block
("Game in progress — spectating comes later."), guest join, action
plumbing, per-seat bot loop over MULTIPLE bot ids, replace-dropped-guest-
with-bot mid-match, results, leave/reset, pushGameUrl, liveGameNow).
Differences from Wahoo, decided:

1. **Prefix** `MT-`; route segment `mexican-train` added to `RoutedGame` +
   `GAME_SEGMENTS` + the same route.test.ts cases the other games get.
2. **Exactly 4 seats**: lobby caps at 4; Start requires exactly 4 seated
   (host auto-fills is NOT a thing — the host presses "Add house bot" like
   Wahoo; the Start button stays disabled until 4). Wahoo's 2–4 logic
   becomes ==4.
3. **Session**: `createMexicanTrainGame([ids×4], seed)`; actions via
   `applyMTAction`. Hands are PRIVATE and there are up to 3 guests, so a
   single broadcast cannot carry hands (the 2-player games get away with
   broadcast because the sole guest is the only listener — with three,
   broadcasting any hand leaks it). Therefore:
   **Add `sendTo(guestId, state)` to `HostHandle` in `src/net/peer.ts`** —
   identical to `broadcast` (including `assertWireSafe`) but sending only
   to that guest's connection if open; no other changes to peer.ts. The MT
   host then: lobby phase → `broadcast` the roster view (all guests may see
   it); game phase → for EACH connected guest, `deriveSnapshot(session,
   guestId)` and `sendTo(guestId, {kind:'game', …, hand: that guest's
   hand})`. The host's own view comes from its local snapshot as usual.
4. **View type**:
   `{ kind:'lobby'; roster:… } | { kind:'game'; revision; publicState: MTPublicState; hand: MTTile[]; names: Record<string,string> }`
   — each recipient's own hand only.
5. **Bot loop**: mirror Wahoo's multi-bot loop (bot ids like Wahoo's).
   Strategy `mexicanTrainBotStrategy` via `runMTBotTurn`. Actor key:
   `stage:turnNumber:handCounts-sum:boneyardCount:doublePending` — turn
   number alone is NOT enough (a double keeps the turn; a playable draw
   keeps the turn) — the key must change on every accepted action so the
   loop paces each step. Derive it from the public state after each apply.
6. **Auto-PASS housekeeping (host)**: after any state change in stage
   'play', if the CURRENT player (human or bot) has no legal play AND the
   boneyard is empty, the host applies `{type:'PASS'}` for that player
   after BASE_MS (the module validates it). This is the prototype-deadlock
   fix's second half — nobody can be stranded without a button. (Bots
   would PASS via strategy anyway; the auto-pass covers humans and keeps
   one code path.) Humans with a boneyard still draw manually via the
   button.
7. **Round advance**: stage 'roundEnd' → host auto-applies
   `{type:'START_NEXT_ROUND'}` after ROUND_PAUSE_MS (dominoes pattern).
   Stage 'over' → MexicanTrainResults.
8. **Table props**: per spec 23's exported contract; colors = the per-seat
   ink map the same way Wahoo assigns seat colors; `hand` from the local
   snapshot; `onPlayTile`/`onDraw` dispatch host-apply/guest-send.
9. **Landing tile** after Checkers: "Mexican Train" /
   "Build your train, dodge the pips" / "4 players" / `#c2410c`, prop
   `onPickMexicanTrain`; bump the shelf count expression (6 → 7 hardcoded
   tiles).
10. **Rematch**: host rebuilds `createMexicanTrainGame` with the same
    seats + fresh seed, revision carried forward +1 (see checkersRematch
    for the pattern).

## Verify before reporting

`npx tsc -b --noEmit` silent; `npm test` green; `npm run build` succeeds.
Report the wahoo sites mirrored, the dominoes per-guest snapshot mechanism
you reused, test count, verbatim final outputs. STOP and report honestly if
a site doesn't map — no improvised architecture.
