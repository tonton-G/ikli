import { createHash } from 'node:crypto'
import { Router } from 'express'
import type { LinkStore, Visit } from './types.js'

// Reduce a request to the few fields stats keep. Deliberately returns a value
// instead of mutating the record: the store folds it in atomically.
function visitFrom(req: { ip?: string; headers: Record<string, any> }): Visit {
  const visitor = createHash('sha256')
    .update(`${req.ip ?? ''}|${req.headers['user-agent'] ?? ''}`)
    .digest('hex')
    .slice(0, 16)

  let referrer = ''
  try {
    if (req.headers.referer) referrer = new URL(req.headers.referer).host
  } catch {
    /* unparseable referer counts as direct */
  }

  return { day: new Date().toISOString().slice(0, 10), visitor, referrer }
}

export function createRedirectRouter(store: LinkStore): Router {
  const router = Router()

  router.get('/:slug([a-z0-9-]{3,32})', async (req, res) => {
    const link = await store.get(req.params.slug)

    // Unknown slug: hand the visitor to the app rather than a bare error, so a
    // mistyped link lands somewhere they can act on.
    if (!link) return res.redirect(302, '/')

    await store.recordVisit(link.slug, visitFrom(req))

    // A cached redirect is a click that never reaches the server, which would
    // quietly under-count stats. 302 rather than 301 for the same reason.
    res.set('Cache-Control', 'no-store')
    res.redirect(302, link.longUrl)
  })

  return router
}
