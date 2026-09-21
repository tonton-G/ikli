import { describe, expect, test } from 'vitest'
import { shortHost } from './api'

describe('shortHost', () => {
  test('extracts the host from a server-issued short URL', () => {
    expect(shortHost('https://ikli.example/kf3a')).toBe('ikli.example')
    expect(shortHost('http://localhost:3001/kf3a')).toBe('localhost:3001')
  })

  test('falls back to the page host when no URL is given', () => {
    expect(shortHost()).toBe(window.location.host)
  })

  test('falls back to the page host on a malformed URL', () => {
    expect(shortHost('not a url')).toBe(window.location.host)
  })
})
