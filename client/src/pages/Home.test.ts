import { describe, expect, test } from 'vitest'
import { editSlugFrom } from './Home'

// The page's own host is whatever jsdom is serving from; "localhost:3001" is
// the hardcoded dev fallback.
const OWN_HOST = window.location.host

describe('editSlugFrom', () => {
  test('a bare slug is an edit request', () => {
    expect(editSlugFrom('kf3a')).toBe('kf3a')
    expect(editSlugFrom('my-slug-123')).toBe('my-slug-123')
  })

  test('a full short URL on our own host resolves to its slug', () => {
    expect(editSlugFrom(`http://${OWN_HOST}/kf3a`)).toBe('kf3a')
    expect(editSlugFrom(`https://${OWN_HOST}/kf3a/`)).toBe('kf3a')
    expect(editSlugFrom('localhost:3001/kf3a')).toBe('kf3a')
  })

  test('someone else\'s URL is a shorten, not an edit', () => {
    expect(editSlugFrom('https://example.com/kf3a')).toBeNull()
    expect(editSlugFrom('example.com')).toBeNull()
  })

  test('an edit key is never mistaken for a slug', () => {
    expect(editSlugFrom('tide-9042-plum')).toBeNull()
  })

  test('too short, too long, or bad characters are not slugs', () => {
    expect(editSlugFrom('ab')).toBeNull()
    expect(editSlugFrom('a'.repeat(33))).toBeNull()
    expect(editSlugFrom('has spaces')).toBeNull()
  })

  test('case and surrounding whitespace are normalized', () => {
    expect(editSlugFrom('  KF3A  ')).toBe('kf3a')
  })
})
