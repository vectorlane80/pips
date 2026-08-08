import { GAME_BLURB, GAME_COLOR, GAME_LABEL, GAME_PLAYER_RANGE, type Game } from '../types'
import { Wordmark } from '../components/Wordmark'

const GAMES: Game[] = ['farkle', 'yahtzee', 'ttt', 'hangman']

export function Landing({
  name, onNameChange, joinCode, onJoinCodeChange, onJoin, onPickGame, onPickRummy, error,
}: {
  name: string
  onNameChange: (v: string) => void
  joinCode: string
  onJoinCodeChange: (v: string) => void
  onJoin: () => void
  onPickGame: (g: Game) => void
  onPickRummy: () => void
  error: string | null
}) {
  const ready = name.trim().length > 0
  const canJoin = ready && joinCode.trim().length > 0

  return (
    <div style={{ maxWidth: 1120, margin: '0 auto', padding: 'clamp(28px,6vw,72px) clamp(18px,5vw,48px) 72px' }}>
      <Wordmark />

      <h1 style={{
        fontSize: 'clamp(34px,5vw,58px)', lineHeight: 1.02, letterSpacing: '-0.03em',
        margin: '20px 0 0', fontWeight: 700, maxWidth: '18ch',
      }}
      >
        Small games. <span style={{ color: 'var(--violet)' }}>One code.</span> Whoever's around.
      </h1>
      <p style={{
        fontSize: 'clamp(16px,1.9vw,18px)', lineHeight: 1.5, maxWidth: '46ch',
        marginTop: 12, color: 'var(--body-text)',
      }}
      >
        Dice, cards, pencil and paper — on your own or with a table full. Pick a game, share the code, play. No account, nothing to install.
      </p>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'clamp(24px,5vw,64px)', marginTop: 'clamp(22px,3vw,34px)', alignItems: 'flex-start' }}>
        <div style={{ flex: '1 1 300px', maxWidth: 380, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <label style={{ fontWeight: 600, fontSize: 15 }}>
            Your name
            <input
              className="input"
              style={{ marginTop: 6 }}
              value={name}
              onChange={(e) => onNameChange(e.target.value)}
              placeholder="Player One"
              autoComplete="off"
            />
          </label>
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
            <label style={{ fontWeight: 600, fontSize: 15, flex: 1 }}>
              Join with a code
              <input
                className="input input-code"
                style={{ marginTop: 6 }}
                value={joinCode}
                onChange={(e) => onJoinCodeChange(e.target.value.toUpperCase())}
                placeholder="BONE-47"
              />
            </label>
            <button type="button" className="btn btn-coral" style={{ height: 52 }} disabled={!canJoin} onClick={onJoin}>
              Join
            </button>
          </div>
          {!ready && <p style={{ fontSize: 14, color: 'var(--faint-text)', margin: 0 }}>Just a name — no account, no password.</p>}
          {error && <p style={{ fontSize: 14, color: 'var(--coral)', margin: 0, fontWeight: 600 }}>{error}</p>}
        </div>

        <div style={{ flex: '1 1 340px', maxWidth: 560 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
            <span style={{ fontWeight: 600, fontSize: 15 }}>On the shelf</span>
            <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--faint-text)' }}>
              {ready ? `${GAMES.length} games` : 'type a name to start one'}
            </span>
          </div>
          <div className="shelf-grid">
            {GAMES.map((g) => (
              <button
                key={g}
                type="button"
                className="shelf-tile"
                disabled={!ready}
                onClick={() => onPickGame(g)}
                style={{
                  ['--tile-border' as string]: ready ? 'var(--ink)' : 'var(--grey-border)',
                  ['--tile-shadow' as string]: ready ? 'var(--ink)' : 'var(--grey-border-4)',
                  background: ready ? GAME_COLOR[g] : 'var(--grey-fill)',
                  color: ready ? '#fff' : 'var(--disabled-text)',
                }}
              >
                <span style={{ display: 'block', fontSize: 19, fontWeight: 700 }}>{GAME_LABEL[g]}</span>
                <span style={{ display: 'block', fontSize: 12, fontWeight: 400, lineHeight: 1.35, opacity: 0.85, marginTop: 2 }}>
                  {GAME_BLURB[g]}
                </span>
                <span className="shelf-tile-note" style={{ display: 'block', fontSize: 12, fontWeight: 500 }}>
                  {GAME_PLAYER_RANGE[g]}
                </span>
              </button>
            ))}
            <button
              type="button"
              className="shelf-tile"
              disabled={!ready}
              onClick={onPickRummy}
              style={{
                ['--tile-border' as string]: ready ? 'var(--ink)' : 'var(--grey-border)',
                ['--tile-shadow' as string]: ready ? 'var(--ink)' : 'var(--grey-border-4)',
                background: ready ? 'var(--green-text)' : 'var(--grey-fill)',
                color: ready ? '#fff' : 'var(--disabled-text)',
              }}
            >
              <span style={{ display: 'block', fontSize: 19, fontWeight: 700 }}>Rummy</span>
              <span style={{ display: 'block', fontSize: 12, fontWeight: 400, lineHeight: 1.35, opacity: 0.85, marginTop: 2 }}>
                Draw, meld, discard — go out first
              </span>
              <span className="shelf-tile-note" style={{ display: 'block', fontSize: 12, fontWeight: 500 }}>
                2 players
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
