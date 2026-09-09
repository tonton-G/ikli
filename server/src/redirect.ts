import { createHash } from 'node:crypto'
import { Router } from 'express'
import { OTHER_REFERRER, type LinkStore, type Visit } from './types.js'

// RFC 1123 hostname: dot-separated labels of letters, digits and hyphens, no
// label starting or ending with a hyphen. Anything else in a Referer is either
// malformed or crafted, and either way it does not get its own map key.
const HOSTNAME_RE =
  /^(?=.{1,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/

// '' for no Referer at all (direct). A Referer that is present but does not
// parse to a plausible host is folded into the overflow bucket rather than
// counted as direct, so garbage can't inflate a real metric.
function referrerHost(referer: unknown): string {
  if (typeof referer !== 'string' || referer === '') return ''
  try {
    const host = new URL(referer).hostname.toLowerCase()
    return HOSTNAME_RE.test(host) ? host : OTHER_REFERRER
  } catch {
    return OTHER_REFERRER
  }
}

// Reduce a request to the few fields stats keep. Deliberately returns a value
// instead of mutating the record: the store folds it in atomically.
function visitFrom(req: { ip?: string; headers: Record<string, any> }): Visit {
  const visitor = createHash('sha256')
    .update(`${req.ip ?? ''}|${req.headers['user-agent'] ?? ''}`)
    .digest('hex')
    .slice(0, 16)

  return {
    day: new Date().toISOString().slice(0, 10),
    visitor,
    referrer: referrerHost(req.headers.referer),
  }
}

export function createRedirectRouter(store: LinkStore): Router {
  const router = Router()

  router.get('/:slug([a-z0-9-]{3,32})', async (req, res) => {
    const link = await store.get(req.params.slug)

    // Unknown slug: hand the visitor to the app rather than a bare error, so a
    // mistyped link lands somewhere they can act on.
    if (!link) return res.redirect(302, '/')

    // Stats are secondary to the redirect. If the counter write fails for any
    // reason (throttling, a full record, a transient error) the visitor still
    // gets where they were going and we lose one data point, not the link.
    try {
      await store.recordVisit(link.slug, visitFrom(req))
    } catch (err) {
      console.error(`recordVisit failed for ${link.slug}:`, err)
    }

    // A cached redirect is a click that never reaches the server, which would
    // quietly under-count stats. 302 rather than 301 for the same reason.
    res.set('Cache-Control', 'no-store')
    res.redirect(302, link.longUrl)
  })

  return router
}
