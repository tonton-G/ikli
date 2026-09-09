import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { rm } from 'node:fs/promises'
import type { Server } from 'node:http'
import { createApp } from './app.js'
import { FileStore } from './file-store.js'
import { DEFAULT_QR_STYLE } from './types.js'

const dataFile = join(tmpdir(), `ikli-test-${process.pid}.json`)
let server: Server
let base: string

before(async () => {
  const app = createApp(new FileStore(dataFile))
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve())
  })
  const addr = server.address()
  if (addr === null || typeof addr === 'string') throw new Error('no port')
  base = `http://127.0.0.1:${addr.port}`
})

after(async () => {
  server.close()
  await rm(dataFile, { force: true })
})

async function createLink(url = 'https://example.com/some/long/path') {
  const res = await fetch(`${base}/api/links`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ url }),
  })
  assert.equal(res.status, 201)
  return res.json()
}

test('create returns slug, edit key, and default QR style', async () => {
  const link = await createLink()
  assert.match(link.slug, /^[a-z0-9]{4,5}$/)
  assert.match(link.editKey, /^[a-z]+-\d{4}-[a-z]+$/)
  assert.equal(link.qrStyle.pattern, 'square')
})

test('bare domains get https:// prepended; garbage is rejected', async () => {
  const link = await createLink('example.org/x')
  assert.equal(link.longUrl, 'https://example.org/x')

  for (const url of ['not a url at all', 'javascript:alert(1)', 'data:text/html,x']) {
    const bad = await fetch(`${base}/api/links`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url }),
    })
    assert.equal(bad.status, 400, `should have rejected ${url}`)
  }
})

test('visit redirects to the destination and records stats', async () => {
  const link = await createLink('https://example.com/target')
  const res = await fetch(`${base}/${link.slug}`, { redirect: 'manual' })
  assert.equal(res.status, 302)
  assert.equal(res.headers.get('location'), 'https://example.com/target')
  // A cached redirect would be an uncounted click.
  assert.equal(res.headers.get('cache-control'), 'no-store')

  const stats = await (
    await fetch(`${base}/api/links/${link.slug}/stats`)
  ).json()
  assert.equal(stats.clicks, 1)
  assert.equal(stats.uniques, 1)
})

test('edits require the key; wrong key is rejected', async () => {
  const link = await createLink()

  const denied = await fetch(`${base}/api/links/${link.slug}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      key: 'wrong-0000-key',
      url: 'https://evil.example',
    }),
  })
  assert.equal(denied.status, 403)

  const ok = await fetch(`${base}/api/links/${link.slug}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ key: link.editKey, url: 'https://example.net/new' }),
  })
  assert.equal(ok.status, 200)
  assert.equal((await ok.json()).longUrl, 'https://example.net/new')
})

test('slug rename keeps the link reachable at the new slug only', async () => {
  const link = await createLink()
  const newSlug = `renamed-${Date.now().toString(36)}`

  const res = await fetch(`${base}/api/links/${link.slug}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ key: link.editKey, slug: newSlug }),
  })
  assert.equal(res.status, 200)
  assert.equal((await res.json()).slug, newSlug)

  const old = await fetch(`${base}/${link.slug}`, { redirect: 'manual' })
  assert.equal(old.headers.get('location'), '/')
  const renamed = await fetch(`${base}/${newSlug}`, { redirect: 'manual' })
  assert.equal(renamed.status, 302)
  assert.equal(
    renamed.headers.get('location'),
    'https://example.com/some/long/path',
  )
})

test('qr style accepts new fields, normalizes old-shape payloads, rejects junk', async () => {
  const link = await createLink()

  const full = await fetch(`${base}/api/links/${link.slug}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      key: link.editKey,
      qrStyle: {
        pattern: 'fluid',
        corners: 'leaf',
        color: '#2f7d5c',
        color2: '#8b5cf6',
        gradient: 'radial',
        eyeColor: '#1a1a1a',
        bg: null,
        frame: 'scanme',
        frameText: 'Menu →',
        frameColor: '#2f7d5c',
        logo: '🍕',
        logoSize: 'lg',
      },
    }),
  })
  assert.equal(full.status, 200)
  const saved = (await full.json()).qrStyle
  assert.equal(saved.pattern, 'fluid')
  assert.equal(saved.logo, '🍕')
  assert.equal(saved.logoSize, 'lg')
  assert.equal(saved.bg, null)

  // an old client sending only the original four fields still works
  const oldShape = await fetch(`${base}/api/links/${link.slug}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      key: link.editKey,
      qrStyle: {
        pattern: 'dots',
        corners: 'square',
        color: '#1a1a1a',
        frame: 'none',
      },
    }),
  })
  assert.equal(oldShape.status, 200)
  const defaulted = (await oldShape.json()).qrStyle
  assert.equal(defaulted.frameText, 'Scan me')
  assert.equal(defaulted.logoSize, 'md')

  const oversized = await fetch(`${base}/api/links/${link.slug}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      key: link.editKey,
      qrStyle: {
        pattern: 'square',
        corners: 'square',
        color: '#1a1a1a',
        frame: 'none',
        logo: `data:image/png;base64,${'A'.repeat(95_000)}`,
      },
    }),
  })
  assert.equal(oversized.status, 400)

  const badSize = await fetch(`${base}/api/links/${link.slug}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      key: link.editKey,
      qrStyle: { ...DEFAULT_QR_STYLE, logoSize: 'huge' },
    }),
  })
  assert.equal(badSize.status, 400)
})

test('delete removes the link', async () => {
  const link = await createLink()
  const res = await fetch(`${base}/api/links/${link.slug}`, {
    method: 'DELETE',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ key: link.editKey }),
  })
  assert.equal(res.status, 204)
  const gone = await fetch(`${base}/${link.slug}`, { redirect: 'manual' })
  assert.equal(gone.headers.get('location'), '/')
})

test('healthz answers for the load balancer and cannot be claimed as a slug', async () => {
  const res = await fetch(`${base}/healthz`)
  assert.equal(res.status, 200)
  assert.deepEqual(await res.json(), { ok: true })

  // Without the reservation this rename would shadow the health check and the
  // target group would start failing.
  const link = await createLink()
  const taken = await fetch(`${base}/api/links/${link.slug}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ key: link.editKey, slug: 'healthz' }),
  })
  assert.equal(taken.status, 400)
})

test('concurrent visits are all counted, none lost', async () => {
  const link = await createLink('https://example.com/busy')
  const VISITS = 25

  // Each distinct user-agent hashes to a distinct visitor, so this exercises
  // the click counter, the day bucket and the unique set at the same time.
  await Promise.all(
    Array.from({ length: VISITS }, (_, i) =>
      fetch(`${base}/${link.slug}`, {
        redirect: 'manual',
        headers: { 'user-agent': `probe-${i}` },
      }),
    ),
  )

  const stats = await (
    await fetch(`${base}/api/links/${link.slug}/stats`)
  ).json()
  assert.equal(stats.clicks, VISITS)
  assert.equal(stats.uniques, VISITS)
  const perDay = Object.values(stats.clicksByDay as Record<string, number>)
  assert.equal(
    perDay.reduce((a, b) => a + b, 0),
    VISITS,
  )
})
