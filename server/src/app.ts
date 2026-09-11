import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express, { type ErrorRequestHandler, type Express } from 'express';
import { createApiRouter } from './api.js';
import { createLimiters } from './rate-limit.js';
import { createRedirectRouter } from './redirect.js';
import type { LinkStore } from './types.js';

// Works from both src/ (tsx) and dist/ (compiled): each sits one level under
// server/, so the client build is always two levels up.
const clientDist = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../client/dist',
);

export interface AppOptions {
  /**
   * X-Forwarded-For entries to trust, counting back from the socket. 0 trusts
   * nothing, so req.ip is the peer address; 1 is correct behind the ALB alone
   * and 2 once CloudFront sits in front of it. Configuration rather than a
   * constant because the right answer changes when the edge does, and getting
   * it wrong is silent: too high lets a caller forge the identity that stats
   * and the per-IP limits key on, too low folds every visitor into one address.
   */
  trustProxyHops?: number;
  /**
   * Per-IP limits, on unless a caller opts out. Only the tests do, because they
   * drive more traffic from one address in a second than a person does in a day.
   */
  rateLimit?: boolean;
}

export function createApp(
  store: LinkStore,
  baseUrl: string,
  options: AppOptions = {},
): Express {
  const { trustProxyHops = 0, rateLimit = true } = options;
  const app = express();
  app.set('trust proxy', trustProxyHops);
  app.use(express.json({ limit: '256kb' })); // headroom for QR logo data URIs

  const limiters = createLimiters(rateLimit);

  // Load balancer target-group health check. Outside /api so it stays
  // independent of how API traffic is routed, and ahead of every limiter so a
  // busy instance can never fail its own health check and be shot by the ASG.
  app.get('/healthz', (_req, res) => res.json({ ok: true }));
  app.use('/api', createApiRouter(store, baseUrl, limiters));
  // Before the redirect router: /assets/foo.js resolves to a real file and
  // never reaches slug matching ('assets' is a reserved slug, so the reverse
  // can't happen). index: false keeps / falling through to the SPA fallback
  // rather than being answered here.
  app.use(express.static(clientDist, { index: false }));
  app.use('/', createRedirectRouter(store, limiters.redirect));

  // SPA fallback: anything left (/, /<slug>/edit, /<slug>+, unknown paths)
  // gets the shell and lets React Router decide. If the client build is
  // missing, sendFile errors and Express's default 404 takes over.
  const indexHtml = path.join(clientDist, 'index.html');
  app.use((req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    res.sendFile(indexHtml, (err) => {
      if (err) next();
    });
  });

  // Last in the chain: everything the wrapped handlers pass to next() lands
  // here. Without it Express's own handler answers, which returns HTML and
  // includes the stack trace whenever NODE_ENV is not 'production'.
  const onError: ErrorRequestHandler = (err, req, res, next) => {
    console.error(`${req.method} ${req.originalUrl} failed:`, err);
    // The response already started, so nothing coherent can be added to it.
    // Express's default handler destroys the socket, which is the right end.
    if (res.headersSent) return next(err);

    // A store that timed out or was throttled is a transient failure worth
    // retrying. Anything else here is a bug, and calling that 503 would send
    // whoever reads it looking at the network instead. The log has the truth
    // either way; this only decides what the caller is told.
    const transient = err?.name === 'TimeoutError' || Boolean(err?.$retryable);
    const status = transient ? 503 : 500;

    if (req.originalUrl.startsWith('/api')) {
      res.status(status).json({ error: transient ? 'unavailable' : 'internal' });
    } else {
      res
        .status(status)
        .type('text/plain')
        .send(transient ? 'Temporarily unavailable' : 'Something went wrong');
    }
  };
  app.use(onError);

  return app;
}
