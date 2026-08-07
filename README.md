# Pips

Little games for two people and one code. Pick a game, share a room code, play — no
account, no sign-in, nothing to install.

Five games: **Farkle**, **Yahtzee**, **Tic Tac Toe**, **Hangman**, and **Rummy**. Farkle
and Yahtzee support a full party (up to 8 players); Tic Tac Toe, Hangman, and Rummy are
two-player. Every game can be played solo against a house bot.

Rummy is built on a separate, reusable card-game engine (`src/card-engine/`) designed to
support future card games (Golf, Crazy Eights, Hearts, Spades, Phase 10) without
reimplementing decks, hands, hidden information, and turn order each time — see
[docs/card-engine.md](docs/card-engine.md) and [docs/rummy.md](docs/rummy.md).

## Stack

- React + TypeScript + Vite
- [PeerJS](https://peerjs.com/) for peer-to-peer multiplayer — the room host holds the
  authoritative game state and streams it to guests over WebRTC data channels. No backend,
  no server to run or pay for.

## Development

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

Deploys to GitHub Pages automatically on push to `main` via
[.github/workflows/deploy.yml](.github/workflows/deploy.yml).

## Design

See the [Design Handoff](Design%20Handoff) folder (gitignored, local only) for the original
design reference and full game-rules spec this app was built from.
