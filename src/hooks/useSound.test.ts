import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useSound } from './useSound'

function EnabledProbe() {
  const { enabled } = useSound()
  return createElement('span', null, enabled ? 'on' : 'off')
}

function ToggleOffProbe() {
  const { enabled, setEnabled } = useSound()
  if (enabled) setEnabled(false)
  return createElement('span', null, enabled ? 'on' : 'off')
}

function PlayProbe() {
  const { enabled, play } = useSound()
  play('dice-roll')
  return createElement('span', null, enabled ? 'on' : 'off')
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('useSound — cookie read', () => {
  it('defaults to enabled when no pips-sound cookie is set', () => {
    // No `document` at all (the SSR guard branch) — still on.
    expect(renderToString(createElement(EnabledProbe))).toBe('<span>on</span>')

    // Document present but no pips-sound cookie — still on.
    vi.stubGlobal('document', { cookie: '' })
    expect(renderToString(createElement(EnabledProbe))).toBe('<span>on</span>')
  })

  it('reports disabled when the cookie is pips-sound=off', () => {
    vi.stubGlobal('document', { cookie: 'theme=dark; pips-sound=off' })
    expect(renderToString(createElement(EnabledProbe))).toBe('<span>off</span>')
  })

  it('reports enabled when the cookie is pips-sound=on', () => {
    vi.stubGlobal('document', { cookie: 'pips-sound=on' })
    expect(renderToString(createElement(EnabledProbe))).toBe('<span>on</span>')
  })
})

describe('useSound — setEnabled', () => {
  it('setEnabled(false) writes pips-sound=off to the cookie and disables sound', () => {
    const doc = { cookie: '' }
    vi.stubGlobal('document', doc)

    expect(renderToString(createElement(ToggleOffProbe))).toBe('<span>off</span>')
    expect(doc.cookie).toBe('pips-sound=off; path=/; max-age=31536000; samesite=lax')

    // A fresh mount re-reads the persisted cookie and reports disabled.
    expect(renderToString(createElement(EnabledProbe))).toBe('<span>off</span>')
  })
})

describe('useSound — play', () => {
  it('play() is a no-op and does not throw when sound is disabled', () => {
    vi.stubGlobal('document', { cookie: 'pips-sound=off' })
    // In the node test env `Audio` is undefined, so reaching here proves play()
    // bailed before constructing an audio element.
    expect(renderToString(createElement(PlayProbe))).toBe('<span>off</span>')
  })
})
