import { describe, expect, test } from 'vitest'
import { renderQrSvg } from './qr'
import type { QrStyle } from './api'

const BASE: QrStyle = {
  pattern: 'square',
  corners: 'square',
  color: '#1a1a1a',
  color2: null,
  gradient: 'linear',
  eyeColor: null,
  bg: '#ffffff',
  frame: 'none',
  frameText: 'Scan me',
  frameColor: null,
  logo: null,
  logoSize: 'md',
}

const URL_TEXT = 'https://ikli.example/kf3a'

describe('renderQrSvg', () => {
  test('renders a self-contained SVG using the module color', () => {
    const svg = renderQrSvg(URL_TEXT, BASE)
    expect(svg).toMatch(/^<svg /)
    expect(svg).toContain('fill="#1a1a1a"')
    expect(svg).toContain('fill="#ffffff"') // background rect
  })

  test('a null background renders no background fill', () => {
    const svg = renderQrSvg(URL_TEXT, { ...BASE, bg: null })
    expect(svg).not.toContain('#ffffff')
  })

  test('a second color switches fills to a gradient', () => {
    const linear = renderQrSvg(URL_TEXT, { ...BASE, color2: '#4a72d8' })
    expect(linear).toContain('<linearGradient')
    expect(linear).toContain('url(#qg)')
    const radial = renderQrSvg(URL_TEXT, { ...BASE, color2: '#4a72d8', gradient: 'radial' })
    expect(radial).toContain('<radialGradient')
  })

  test('frame text is escaped, never injected as markup', () => {
    const svg = renderQrSvg(URL_TEXT, {
      ...BASE,
      frame: 'scanme',
      frameText: '<img src=x onerror=1>',
    })
    expect(svg).not.toContain('<img')
    expect(svg).toContain('&lt;img')
  })

  test('an emoji logo is rendered as escaped text, a data URI as an image', () => {
    const emoji = renderQrSvg(URL_TEXT, { ...BASE, logo: '🔗' })
    expect(emoji).toContain('>🔗</text>')
    const dataUri = 'data:image/png;base64,AAAA'
    const image = renderQrSvg(URL_TEXT, { ...BASE, logo: dataUri })
    expect(image).toContain(`<image href="${dataUri}"`)
  })
})
