import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { rm } from 'node:fs/promises'
import type { Server } from 'node:http'
import { createApp, type AppOptions } from './app.js'
import { FileStore } from './file-store.js'
import { DEFAULT_QR_STYLE, OTHER_REFERRER, REFERRER_CAP, type LinkStore } from './types.js'

const dataFile = join(tmpdir(), `ikli-test-${process.pid}.json`)
// Fixed, and deliberately not the address the test server listens on: short
// URLs must come from configuration, not from the request host.
const BASE_URL = 'https://ikli.test'
let server: Server
let base: string

before(async () => {
  // Limits off: this suite sends more requests from 127.0.0.1 in a second than
  // a person would in a day. The limiters get their own servers further down.
  const app = createApp(new FileStore(dataFile), BASE_URL, { rateLimit: false })
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

  // Same visitor again: one more click, still one unique.
  await fetch(`${base}/${link.slug}`, { redirect: 'manual' })

  const stats = await (
    await fetch(`${base}/api/links/${link.slug}/stats`)
  ).json()
  assert.equal(stats.clicks, 2)
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

test('referrer map is capped; overflow folds into one bucket', async () => {
  const link = await createLink()
  const distinct = REFERRER_CAP + 10
  await Promise.all(
    Array.from({ length: distinct }, (_, i) =>
      fetch(`${base}/${link.slug}`, {
        redirect: 'manual',
        headers: { referer: `https://site-${i}.example/page` },
      }),
    ),
  )
  const stats = await (await fetch(`${base}/api/links/${link.slug}/stats`)).json()
  const keys = Object.keys(stats.referrers)
  assert.equal(keys.length, REFERRER_CAP + 1, 'cap plus the overflow bucket')
  assert.ok(keys.includes(OTHER_REFERRER))
  assert.equal(stats.referrers[OTHER_REFERRER], distinct - REFERRER_CAP)
  // Total attribution still matches total clicks: nothing was dropped.
  const attributed = Object.values(stats.referrers as Record<string, number>).reduce((a, b) => a + b, 0)
  assert.equal(attributed, distinct)
  assert.equal(stats.clicks, distinct)
})

test('a Referer that is not a plausible host is bucketed, not counted as direct', async () => {
  const link = await createLink()
  for (const referer of [
    'not a url',
    'https://[::1]/x', // bracketed IPv6 literal
    'https://bad_host!.example/',
    'https://' + 'a'.repeat(300) + '.example/', // over the 253-char limit
  ]) {
    await fetch(`${base}/${link.slug}`, { redirect: 'manual', headers: { referer } })
  }
  // And one genuinely direct visit.
  await fetch(`${base}/${link.slug}`, { redirect: 'manual' })

  const stats = await (await fetch(`${base}/api/links/${link.slug}/stats`)).json()
  assert.equal(stats.referrers[OTHER_REFERRER], 4)
  assert.equal(stats.referrers[''], 1)
})

test('a failing counter write does not break the redirect', async () => {
  // Wrap the real store so only recordVisit blows up.
  const inner = new FileStore(join(tmpdir(), `ikli-test-failing-${process.pid}.json`))
  const failing: LinkStore = {
    get: (s) => inner.get(s),
    create: (l) => inner.create(l),
    put: (l) => inner.put(l),
    rename: (a, b) => inner.rename(a, b),
    delete: (s) => inner.delete(s),
    recordVisit: async () => {
      throw new Error('simulated DynamoDB failure')
    },
  }
  const app = createApp(failing, BASE_URL, { rateLimit: false })
  const srv = await new Promise<Server>((resolve) => {
    const h = app.listen(0, () => resolve(h))
  })
  const addr = srv.address()
  if (addr === null || typeof addr === 'string') throw new Error('no port')
  const url = `http://127.0.0.1:${addr.port}`
  try {
    const created = await (
      await fetch(`${url}/api/links`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url: 'https://example.com/still-works' }),
      })
    ).json()
    const res = await fetch(`${url}/${created.slug}`, { redirect: 'manual' })
    assert.equal(res.status, 302)
    assert.equal(res.headers.get('location'), 'https://example.com/still-works')
  } finally {
    srv.close()
  }
})

test('malformed slugs are rejected at the API boundary', async () => {
  for (const bad of ['v%23abcd%23deadbeef', 'UPPER', 'ab', 'has_underscore', 'x'.repeat(33)]) {
    const res = await fetch(`${base}/api/links/${bad}`)
    assert.equal(res.status, 404, `expected 404 for ${bad}`)
  }
})


// --- slug minting is a conditional write, not a read-then-write race ---

test('concurrent creates never collide on a slug', async () => {
  const results = await Promise.all(
    Array.from({ length: 40 }, (_, i) =>
      fetch(`${base}/api/links`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url: `https://example.com/race/${i}` }),
      }).then((r) => r.json()),
    ),
  )

  const slugs = results.map((r) => r.slug)
  assert.equal(new Set(slugs).size, slugs.length, 'two creates shared a slug')

  // Every link must still resolve to its own destination: an overwrite would
  // leave one slug pointing at the other's URL, or drop a record entirely.
  for (const [i, r] of results.entries()) {
    const hit = await fetch(`${base}/${r.slug}`, { redirect: 'manual' })
    assert.equal(hit.status, 302)
    assert.equal(hit.headers.get('location'), `https://example.com/race/${i}`)
  }
})

test('create refuses to overwrite an existing slug', async () => {
  const link = await createLink()
  const store = new FileStore(dataFile)
  const taken = await store.create({
    ...(await store.get(link.slug))!,
    longUrl: 'https://evil.example/overwritten',
  })
  assert.equal(taken, false, 'create must not overwrite a live record')

  const hit = await fetch(`${base}/${link.slug}`, { redirect: 'manual' })
  assert.equal(hit.headers.get('location'), 'https://example.com/some/long/path')
})

// --- destination hosts ---

test('private, loopback and link-local destinations are rejected', async () => {
  const blocked = [
    'http://localhost:8080/admin',
    'http://app.localhost/x',
    'http://127.0.0.1/x',
    'http://127.1.2.3/x',
    'http://2130706433/', // decimal spelling of 127.0.0.1
    'http://[::1]/',
    'http://10.0.0.5/internal',
    'http://172.16.0.9/',
    'http://172.31.255.254/',
    'http://192.168.1.1/',
    'http://169.254.169.254/latest/meta-data/',
    'http://printer.local/',
  ]
  for (const url of blocked) {
    const res = await fetch(`${base}/api/links`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url }),
    })
    assert.equal(res.status, 400, `should have rejected ${url}`)
    assert.equal((await res.json()).error, 'invalid_url')
  }
})

test('public addresses adjacent to the blocked ranges still work', async () => {
  // 172.15/172.32 sit either side of 172.16.0.0/12; 169.253 outside 169.254/16.
  for (const url of [
    'https://example.com/ok',
    'http://172.15.0.1/',
    'http://172.32.0.1/',
    'http://169.253.0.1/',
    'http://11.0.0.1/',
    'http://mylocalhost.com/',
    'http://notlocal.example/',
  ]) {
    const res = await fetch(`${base}/api/links`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url }),
    })
    assert.equal(res.status, 201, `should have accepted ${url}`)
  }
})

// --- short URLs come from configuration ---

test('shortUrl is built from BASE_URL, not the request host', async () => {
  const link = await createLink()
  assert.equal(link.shortUrl, `${BASE_URL}/${link.slug}`)
  assert.ok(!link.shortUrl.includes('127.0.0.1'), 'leaked the request host')

  // Same field on the read path, which is what the QR page loads on reload.
  const got = await fetch(`${base}/api/links/${link.slug}`).then((r) => r.json())
  assert.equal(got.shortUrl, `${BASE_URL}/${link.slug}`)
})

test('shortUrl follows a rename', async () => {
  const link = await createLink()
  const newSlug = `moved-${Date.now().toString(36)}`
  const res = await fetch(`${base}/api/links/${link.slug}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ key: link.editKey, slug: newSlug }),
  })
  assert.equal((await res.json()).shortUrl, `${BASE_URL}/${newSlug}`)
})

// --- a failed rename must not commit the field edits sent with it ---

test('a rename onto a taken slug leaves the record untouched', async () => {
  const target = await createLink('https://example.com/target')
  const link = await createLink('https://example.com/original')

  const res = await fetch(`${base}/api/links/${link.slug}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      key: link.editKey,
      url: 'https://example.com/edited',
      slug: target.slug, // already taken: the rename must fail
    }),
  })
  assert.equal(res.status, 409)
  assert.equal((await res.json()).error, 'slug_taken')

  // The url edit rode along with the failed rename and must not have landed.
  const after = await fetch(`${base}/api/links/${link.slug}`).then((r) => r.json())
  assert.equal(after.longUrl, 'https://example.com/original')

  const hit = await fetch(`${base}/${link.slug}`, { redirect: 'manual' })
  assert.equal(hit.headers.get('location'), 'https://example.com/original')

  // ...and the target it collided with is unchanged too.
  const untouched = await fetch(`${base}/${target.slug}`, { redirect: 'manual' })
  assert.equal(untouched.headers.get('location'), 'https://example.com/target')
})

test('a successful rename does commit the field edits sent with it', async () => {
  const link = await createLink('https://example.com/before')
  const newSlug = `both-${Date.now().toString(36)}`

  const res = await fetch(`${base}/api/links/${link.slug}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      key: link.editKey,
      url: 'https://example.com/after',
      slug: newSlug,
    }),
  })
  assert.equal(res.status, 200)
  const body = await res.json()
  assert.equal(body.slug, newSlug)
  assert.equal(body.longUrl, 'https://example.com/after')

  const hit = await fetch(`${base}/${newSlug}`, { redirect: 'manual' })
  assert.equal(hit.headers.get('location'), 'https://example.com/after')
})

// --- route boundaries ---

test('an unknown /api path answers in JSON, not the SPA shell', async () => {
  // Falling through to the SPA fallback hands a fetch() caller 200 text/html,
  // which then fails at .json() instead of surfacing the 404 it really got.
  for (const [method, path] of [
    ['GET', '/api/bogus'],
    ['GET', '/api'],
    ['POST', '/api/bogus'],
  ] as const) {
    const res = await fetch(`${base}${path}`, { method })
    const where = `${method} ${path}`
    assert.equal(res.status, 404, where)
    assert.match(res.headers.get('content-type') ?? '', /application\/json/, where)
    assert.deepEqual(await res.json(), { error: 'not_found' }, where)
  }
})

test('a slug typed in capitals still redirects', async () => {
  // Express matches the redirect route case-insensitively, so /ABCD reaches the
  // handler while every stored slug is lowercase. Printed links and phone
  // keyboards produce these constantly.
  const link = await createLink('https://example.com/caps')
  const res = await fetch(`${base}/${link.slug.toUpperCase()}`, { redirect: 'manual' })
  assert.equal(res.status, 302)
  assert.equal(res.headers.get('location'), 'https://example.com/caps')
})

// --- req.ip is only as trustworthy as the configured hop count ---

/** A second app, on its own port and store, for tests needing other options. */
let appCount = 0
async function withApp(
  options: AppOptions,
  fn: (at: string) => Promise<void>,
): Promise<void> {
  const file = join(tmpdir(), `ikli-test-${process.pid}-${appCount++}.json`)
  const app = createApp(new FileStore(file), BASE_URL, options)
  const srv = await new Promise<Server>((resolve) => {
    const h = app.listen(0, () => resolve(h))
  })
  const addr = srv.address()
  if (addr === null || typeof addr === 'string') throw new Error('no port')
  try {
    await fn(`http://127.0.0.1:${addr.port}`)
  } finally {
    srv.close()
    await rm(file, { force: true })
  }
}

const postLink = (at: string, url: string) =>
  fetch(`${at}/api/links`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ url }),
  })

test('X-Forwarded-For is only trusted when the hop count says so', async () => {
  // Visitor identity is a hash of req.ip, so the hop count decides whether a
  // caller can mint identities by sending a header — and, behind CloudFront
  // with the count too low, whether every visitor collapses into one edge IP.
  async function uniques(trustProxyHops: number): Promise<number> {
    let seen = 0
    await withApp({ trustProxyHops, rateLimit: false }, async (at) => {
      const link = await (await postLink(at, 'https://example.com/xff')).json()
      for (const ip of ['203.0.113.1', '203.0.113.2', '203.0.113.3']) {
        await fetch(`${at}/${link.slug}`, {
          redirect: 'manual',
          headers: { 'x-forwarded-for': ip, 'user-agent': 'one-agent' },
        })
      }
      const stats = await (await fetch(`${at}/api/links/${link.slug}/stats`)).json()
      seen = stats.uniques
    })
    return seen
  }

  assert.equal(await uniques(0), 1, 'a forged header split one visitor into three')
  assert.equal(await uniques(1), 3, 'the proxy-supplied client address was ignored')
})

// --- per-IP limits ---

test('link creation is rate limited per IP', async () => {
  await withApp({ rateLimit: true }, async (at) => {
    let limitedAt = 0
    for (let i = 1; i <= 40; i++) {
      const res = await postLink(at, `https://example.com/flood/${i}`)
      if (res.status === 429) {
        assert.deepEqual(await res.json(), { error: 'rate_limited' })
        limitedAt = i
        break
      }
      assert.equal(res.status, 201, `create ${i} should have succeeded`)
    }
    assert.ok(limitedAt > 0, 'forty creates from one address were all allowed')
  })
})

test('wrong edit keys are rate limited; an owner using their own is not', async () => {
  await withApp({ rateLimit: true }, async (at) => {
    const link = await (await postLink(at, 'https://example.com/owned')).json()

    // Restyling a QR code sends a long run of valid PATCHes. Not one of them
    // may count against the brute-force budget, or using a link locks you out.
    for (let i = 0; i < 25; i++) {
      const ok = await fetch(`${at}/api/links/${link.slug}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ key: link.editKey, url: `https://example.com/owned/${i}` }),
      })
      assert.equal(ok.status, 200, `the owner's own edit ${i} was refused`)
    }

    // Guesses are a different matter: ~176M keys is only out of reach while
    // something caps how fast they can be tried.
    let limited = false
    for (let i = 0; i < 40; i++) {
      const res = await fetch(`${at}/api/links/${link.slug}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ key: `wrong-${1000 + i}-guess`, url: 'https://evil.example' }),
      })
      if (res.status === 429) {
        limited = true
        break
      }
      assert.equal(res.status, 403, `guess ${i}`)
    }
    assert.ok(limited, 'forty wrong keys in a row were all checked')

    // And the link still points where its owner last put it.
    const after = await (await fetch(`${at}/api/links/${link.slug}`)).json()
    assert.equal(after.longUrl, 'https://example.com/owned/24')
  })
})

// --- an unreachable store must not take the process with it ---

test('a failing store answers 503 rather than killing the process', async () => {
  // Express 4 does not catch rejections from async handlers. Without wrap()
  // the rejection escapes the request entirely, Node treats it as fatal, and
  // on an ASG that is one instance lost per request while the group replaces
  // it in a loop. If that regresses, the crash takes this whole test file down
  // instead of failing politely — which is exactly the signal wanted.
  const boom = (): never => {
    const err: any = new Error('simulated connection timeout')
    err.name = 'TimeoutError'
    throw err
  }
  const unreachable: LinkStore = {
    get: async () => boom(),
    create: async () => boom(),
    put: async () => boom(),
    rename: async () => boom(),
    delete: async () => boom(),
    recordVisit: async () => boom(),
  }

  const app = createApp(unreachable, BASE_URL, { rateLimit: false })
  const srv = await new Promise<Server>((resolve) => {
    const h = app.listen(0, () => resolve(h))
  })
  const addr = srv.address()
  if (addr === null || typeof addr === 'string') throw new Error('no port')
  const at = `http://127.0.0.1:${addr.port}`

  try {
    // The redirect path answers a person in a browser, so it answers in text.
    const hit = await fetch(`${at}/abcd`, { redirect: 'manual' })
    assert.equal(hit.status, 503, 'redirect path')
    assert.match(hit.headers.get('content-type') ?? '', /text\/plain/)

    // The API answers a client, so it keeps the error shape the rest of the
    // API uses rather than handing back a wall of HTML.
    const read = await fetch(`${at}/api/links/abcd`)
    assert.equal(read.status, 503, 'api read path')
    assert.deepEqual(await read.json(), { error: 'unavailable' })

    const created = await fetch(`${at}/api/links`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url: 'https://example.com/while-down' }),
    })
    assert.equal(created.status, 503, 'api write path')
  } finally {
    srv.close()
  }
})
