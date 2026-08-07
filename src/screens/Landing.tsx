import { GAME_BLURB, GAME_COLOR, GAME_LABEL, type Game } from '../types'
import { Wordmark } from '../components/Wordmark'

const GAMES: Game[] = ['farkle', 'yahtzee', 'ttt', 'hangman']

export function Landing({
  name, onNameChange, joinCode, onJoinCodeChange, onJoin, onPickGame, error,
}: {
  name: string
  onNameChange: (v: string) => void
  joinCode: string
  onJoinCodeChange: (v: string) => void
  onJoin: () => void
  onPickGame: (g: Game) => void
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
        Little games for <span style={{ color: 'var(--violet)' }}>two people</span> and one code.
      </h1>
      <p style={{
        fontSize: 'clamp(16px,1.9vw,18px)', lineHeight: 1.5, maxWidth: '44ch',
        marginTop: 12, color: 'var(--body-text)',
      }}
      >
        Dice, cards, pencil and paper. Pick one, send the code across the room, play. No account, nothing to install.
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
              placeholder="Ada"
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

        <div style={{ flex: '1 1 320px', maxWidth: 460, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <span style={{ fontWeight: 600, fontSize: 15 }}>On the shelf</span>
          {GAMES.map((g) => (
            <button
              key={g}
              type="button"
              disabled={!ready}
              onClick={() => onPickGame(g)}
              style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '18px 20px', borderRadius: 22, border: `4px solid ${ready ? 'var(--ink)' : 'var(--grey-border)'}`,
                boxShadow: ready ? '0 7px 0 var(--ink)' : '0 7px 0 var(--grey-border-4)',
                background: ready ? GAME_COLOR[g] : 'var(--grey-fill)',
                color: ready ? '#fff' : 'var(--disabled-text)',
                cursor: ready ? 'pointer' : 'not-allowed', textAlign: 'left', font: 'inherit',
              }}
            >
              <span>
                <span style={{ display: 'block', fontSize: 26, fontWeight: 700 }}>{GAME_LABEL[g]}</span>
                <span style={{ display: 'block', fontSize: 14, opacity: 0.85, marginTop: 2 }}>{GAME_BLURB[g]}</span>
              </span>
              <span style={{ fontSize: 14, fontWeight: 500, whiteSpace: 'nowrap' }}>
                {ready ? 'Start →' : 'Name yourself first'}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
