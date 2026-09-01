import { createHash } from 'node:crypto'
import { Router } from 'express'
import { verifyPassword } from './keys.js'
import type { LinkRecord, LinkStore } from './types.js'

function recordClick(
  link: LinkRecord,
  req: { ip?: string; headers: Record<string, any> },
): void {
  link.clicks += 1

  const day = new Date().toISOString().slice(0, 10)
  link.clicksByDay[day] = (link.clicksByDay[day] ?? 0) + 1

  const visitor = createHash('sha256')
    .update(`${req.ip ?? ''}|${req.headers['user-agent'] ?? ''}`)
    .digest('hex')
    .slice(0, 16)
  if (!link.visitorHashes.includes(visitor)) link.visitorHashes.push(visitor)

  let referrer = ''
  try {
    if (req.headers.referer) referrer = new URL(req.headers.referer).host
  } catch {
    /* unparseable referer counts as direct */
  }
  link.referrers[referrer] = (link.referrers[referrer] ?? 0) + 1
}

// Minimal server-rendered page, styled to match the app, for the two cases
// where the redirect can't just redirect: password gate and expired/gone.
function page(title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>ikli — ${title}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Caveat:wght@600&family=Geist+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
  body { margin:0; background:#ffffff; color:#1a1a1a; font-family:'Geist Mono',monospace;
         min-height:100vh; display:flex; flex-direction:column; align-items:center; }
  .brand { align-self:flex-start; display:flex; align-items:center; gap:10px; padding:32px 40px;
           font-family:'Caveat',cursive; font-size:26px; font-weight:600; }
  .brand span { width:22px; height:22px; background:#1a1a1a; border-radius:7px; display:inline-block; }
  main { flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center;
         gap:20px; padding:24px; text-align:center; max-width:420px; }
  h1 { font-family:'Caveat',cursive; font-size:40px; font-weight:600; margin:0; }
  p { color:#9a9a9a; font-size:14px; line-height:1.7; margin:0; }
  form { display:flex; gap:10px; }
  input { font-family:inherit; font-size:14px; padding:12px 18px; border:1.5px solid #1a1a1a;
          border-radius:999px; outline:none; width:200px; }
  button { font-family:'Caveat',cursive; font-size:20px; font-weight:600; padding:8px 26px;
           background:#1a1a1a; color:#fff; border:none; border-radius:999px; cursor:pointer; }
  .err { color:#b91c1c; font-size:13px; }
</style>
</head>
<body>
<div class="brand"><span></span>ikli/</div>
<main>${body}</main>
</body>
</html>`
}

export function createRedirectRouter(store: LinkStore): Router {
  const router = Router()

  async function resolve(slug: string, res: any): Promise<LinkRecord | null> {
    const link = await store.get(slug)
    if (!link) {
      res
        .status(404)
        .send(
          page(
            'not found',
            `<h1>Nothing here.</h1><p>This short link doesn't exist.</p>`,
          ),
        )
      return null
    }
    if (link.expiresAt && Date.parse(link.expiresAt) < Date.now()) {
      res
        .status(410)
        .send(
          page(
            'expired',
            `<h1>This link expired.</h1><p>The destination is no longer reachable through this short link.</p>`,
          ),
        )
      return null
    }
    return link
  }

  router.get('/:slug([a-z0-9-]{3,32})', async (req, res) => {
    const link = await resolve(req.params.slug, res)
    if (!link) return

    if (link.passwordHash) {
      return res.send(
        page(
          'password',
          `<h1>This link is locked.</h1>
           <p>Enter the password to continue.</p>
           <form method="post" action="/${link.slug}/unlock">
             <input type="password" name="password" placeholder="password" autofocus>
             <button type="submit">Go</button>
           </form>`,
        ),
      )
    }

    recordClick(link, req)
    await store.put(link)
    res.redirect(302, link.longUrl)
  })

  router.post('/:slug([a-z0-9-]{3,32})/unlock', async (req, res) => {
    const link = await resolve(req.params.slug, res)
    if (!link) return

    const password = req.body?.password
    if (
      !link.passwordHash ||
      typeof password !== 'string' ||
      !verifyPassword(password, link.passwordHash)
    ) {
      return res.status(403).send(
        page(
          'password',
          `<h1>This link is locked.</h1>
           <p class="err">Wrong password — try again.</p>
           <form method="post" action="/${link.slug}/unlock">
             <input type="password" name="password" placeholder="password" autofocus>
             <button type="submit">Go</button>
           </form>`,
        ),
      )
    }

    recordClick(link, req)
    await store.put(link)
    res.redirect(302, link.longUrl)
  })

  return router
}
