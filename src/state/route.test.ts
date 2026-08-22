import { describe, expect, it } from 'vitest'
import {
  decideBoot, GAME_SEGMENTS, gameFromPath, gamePath, readNameCookie, writeNameCookie,
  readCardBackCookie, writeCardBackCookie,
  type CookieAccessor, type RoutedGame,
} from './route'

describe('card back cookie', () => {
  it('round-trips an id alongside the name cookie', () => {
    const accessor: CookieAccessor = { cookie: '' }
    writeNameCookie('Boba', accessor)
    writeCardBackCookie('chevron-stripe', accessor)
    expect(accessor.cookie).toBe('pips-card-back=chevron-stripe; path=/; max-age=31536000; samesite=lax')
    expect(readCardBackCookie(accessor)).toBe('chevron-stripe')
    expect(readCardBackCookie({ cookie: 'pips-name=Boba; pips-card-back=dice-five' })).toBe('dice-five')
  })

  it('returns null when unset or empty', () => {
    expect(readCardBackCookie({ cookie: '' })).toBeNull()
    expect(readCardBackCookie({ cookie: 'pips-name=Boba' })).toBeNull()
    expect(readCardBackCookie({ cookie: 'pips-card-back=' })).toBeNull()
  })
})

describe('gameFromPath', () => {
  it('accepts /pips/<segment>', () => {
    expect(gameFromPath('/pips/wahoo')).toBe('wahoo')
  })

  it('accepts the base-less dev path with trailing slash', () => {
    expect(gameFromPath('pips/wahoo/')).toBe('wahoo')
  })

  it('accepts /pips/checkers', () => {
    expect(gameFromPath('/pips/checkers')).toBe('checkers')
  })

  it('accepts /pips/mexican-train', () => {
    expect(gameFromPath('/pips/mexican-train')).toBe('mexican-train')
  })

  it('accepts /pips/uno', () => {
    expect(gameFromPath('/pips/uno')).toBe('uno')
  })

  it('accepts /pips/chess', () => {
    expect(gameFromPath('/pips/chess')).toBe('chess')
  })

  it('accepts /<segment> without the /pips base', () => {
    expect(gameFromPath('/wahoo')).toBe('wahoo')
  })

  it('returns null for the bare /pips base', () => {
    expect(gameFromPath('/pips/')).toBeNull()
    expect(gameFromPath('/pips')).toBeNull()
  })

  it('returns null for the root path', () => {
    expect(gameFromPath('/')).toBeNull()
  })

  it('returns null for an unknown segment', () => {
    expect(gameFromPath('/pips/nope')).toBeNull()
  })

  it('round-trips every RoutedGame through gamePath → gameFromPath', () => {
    ;(Object.keys(GAME_SEGMENTS) as RoutedGame[]).forEach((game) => {
      expect(gamePath(game)).toBe(`/pips/${GAME_SEGMENTS[game]}`)
      expect(gameFromPath(gamePath(game))).toBe(game)
    })
  })
})

describe('decideBoot', () => {
  it('lets ?join= win over a game path', () => {
    expect(decideBoot('/pips/wahoo', '?join=BONE-42', true)).toEqual({ kind: 'join', code: 'BONE-42' })
    expect(decideBoot('/pips/wahoo', '?join=BONE-42', false)).toEqual({ kind: 'join', code: 'BONE-42' })
  })

  it('hosts the routed game when a name exists', () => {
    expect(decideBoot('/pips/wahoo', '', true)).toEqual({ kind: 'host', game: 'wahoo' })
    expect(decideBoot('/pips/checkers', '', true)).toEqual({ kind: 'host', game: 'checkers' })
    expect(decideBoot('/pips/mexican-train', '', true)).toEqual({ kind: 'host', game: 'mexican-train' })
    expect(decideBoot('/pips/chess', '', true)).toEqual({ kind: 'host', game: 'chess' })
    expect(decideBoot('/pips/uno', '', true)).toEqual({ kind: 'host', game: 'uno' })
  })

  it('asks for a name before hosting when no name exists', () => {
    expect(decideBoot('/pips/wahoo', '', false)).toEqual({ kind: 'shelf-needs-name', game: 'wahoo' })
    expect(decideBoot('/pips/checkers', '', false)).toEqual({ kind: 'shelf-needs-name', game: 'checkers' })
    expect(decideBoot('/pips/mexican-train', '', false)).toEqual({ kind: 'shelf-needs-name', game: 'mexican-train' })
    expect(decideBoot('/pips/chess', '', false)).toEqual({ kind: 'shelf-needs-name', game: 'chess' })
    expect(decideBoot('/pips/uno', '', false)).toEqual({ kind: 'shelf-needs-name', game: 'uno' })
  })

  it('falls back to the shelf with no join code and no game path', () => {
    expect(decideBoot('/', '', false)).toEqual({ kind: 'shelf' })
    expect(decideBoot('/', '', true)).toEqual({ kind: 'shelf' })
  })

  it('passes the join code through verbatim, case preserved', () => {
    expect(decideBoot('/', '?join=Bone-42', false)).toEqual({ kind: 'join', code: 'Bone-42' })
  })

  it('treats an empty ?join= as no join code', () => {
    expect(decideBoot('/pips/wahoo', '?join=', false)).toEqual({ kind: 'shelf-needs-name', game: 'wahoo' })
  })
})

describe('name cookie', () => {
  it('write → read round-trips through the injectable accessor', () => {
    const accessor: CookieAccessor = { cookie: '' }
    writeNameCookie('Boba', accessor)
    expect(accessor.cookie).toBe('pips-name=Boba; path=/; max-age=31536000; samesite=lax')
    expect(readNameCookie(accessor)).toBe('Boba')
  })

  it('writeNameCookie trims the name', () => {
    const accessor: CookieAccessor = { cookie: '' }
    writeNameCookie('  Boba  ', accessor)
    expect(accessor.cookie).toBe('pips-name=Boba; path=/; max-age=31536000; samesite=lax')
    expect(readNameCookie(accessor)).toBe('Boba')
  })

  it('writeNameCookie is a no-op for an empty or whitespace name', () => {
    const accessor: CookieAccessor = { cookie: '' }
    writeNameCookie('', accessor)
    writeNameCookie('   ', accessor)
    expect(accessor.cookie).toBe('')
  })

  it('readNameCookie returns null when no pips-name cookie is set', () => {
    expect(readNameCookie({ cookie: '' })).toBeNull()
    expect(readNameCookie({ cookie: 'theme=dark' })).toBeNull()
  })

  it('readNameCookie trims the stored value', () => {
    expect(readNameCookie({ cookie: 'theme=dark; pips-name=  Boba  ' })).toBe('Boba')
  })

  it('readNameCookie returns null for an empty stored value', () => {
    expect(readNameCookie({ cookie: 'pips-name=' })).toBeNull()
    expect(readNameCookie({ cookie: 'pips-name=   ' })).toBeNull()
  })

  it('round-trips a name containing ; = and unicode', () => {
    const accessor: CookieAccessor = { cookie: '' }
    const tricky = 'Bo;b=a 茶'
    writeNameCookie(tricky, accessor)
    // The name's raw ';' and '=' must not leak into the cookie header —
    // only the encoded form may appear before the '; path=' attributes.
    const value = accessor.cookie.slice('pips-name='.length, accessor.cookie.indexOf('; path='))
    expect(value).toBe(encodeURIComponent(tricky))
    expect(readNameCookie(accessor)).toBe(tricky)
  })

  it('decodes a cookie written with special characters and unicode', () => {
    // Written by an older/newer build or manually: the raw value is the
    // percent-encoded form and must come back decoded.
    expect(readNameCookie({ cookie: 'pips-name=Bo%3Bb%3Da%20%E8%8C%B6' })).toBe('Bo;b=a 茶')
  })

  it('works without an accessor in the DOM-less test env', () => {
    // No `document` here (node env) — the default seam must not throw.
    expect(readNameCookie()).toBeNull()
    expect(() => writeNameCookie('Boba')).not.toThrow()
  })
})
