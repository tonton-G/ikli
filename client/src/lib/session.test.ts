import { beforeEach, describe, expect, test } from 'vitest'
import { forgetKey, moveKey, recallKey, rememberKey } from './session'

beforeEach(() => sessionStorage.clear())

describe('session key store', () => {
  test('remembers and recalls a key per slug', () => {
    rememberKey('kf3a', 'tide-9042-plum')
    expect(recallKey('kf3a')).toBe('tide-9042-plum')
    expect(recallKey('other')).toBeNull()
  })

  test('forgets a key', () => {
    rememberKey('kf3a', 'tide-9042-plum')
    forgetKey('kf3a')
    expect(recallKey('kf3a')).toBeNull()
  })

  test('moves a key across a slug rename', () => {
    rememberKey('kf3a', 'tide-9042-plum')
    moveKey('kf3a', 'launch')
    expect(recallKey('kf3a')).toBeNull()
    expect(recallKey('launch')).toBe('tide-9042-plum')
  })

  test('moving a slug with no key is a no-op', () => {
    moveKey('kf3a', 'launch')
    expect(recallKey('launch')).toBeNull()
  })
})
