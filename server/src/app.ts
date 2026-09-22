import path from 'node:path';
import { fileURLToPath } from 'node:url';
import compression from 'compression';
import express, { type ErrorRequestHandler, type Express } from 'express';
import { createApiRouter } from './api.js';
import { createLimiters } from './rate-limit.js';
import { createRedirectRouter } from './redirect.js';
import type { LinkStore } from './types.js';

const clientDist = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../client/dist',
);

export interface AppOptions {

  trustProxyHops?: number;
  rateLimit?: boolean;
  rateLimitTable?: string;
}

export function createApp(
  store: LinkStore,
  baseUrl: string,
  options: AppOptions = {},
): Express {
  const { trustProxyHops = 0, rateLimit = true, rateLimitTable } = options;
  const app = express();
  app.set('trust proxy', trustProxyHops);
  app.use(compression());
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
  });
  app.use(express.json({ limit: '256kb' }));

  const limiters = createLimiters(rateLimit, rateLimitTable);

  // Load balancer target-group health check. Registered directly on the app,
  // and catch-all.
  app.get('/api/health', (_req, res) => res.json({ ok: true }));
  app.use('/api', createApiRouter(store, baseUrl, limiters));
  app.use(
    express.static(clientDist, {
      index: false,
      // Vite content-hashes everything under assets/, so those files can be
      // cached forever; anything else in dist keeps the default validation.
      setHeaders(res, filePath) {
        if (filePath.includes(`${path.sep}assets${path.sep}`)) {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        }
      },
    }),
  );
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

  const onError: ErrorRequestHandler = (err, req, res, next) => {
    console.error(`${req.method} ${req.originalUrl} failed:`, err);

    if (res.headersSent) return next(err);


    const transient = err?.name === 'TimeoutError' || Boolean(err?.$retryable);
    const status = transient ? 503 : 500;

    if (req.path === '/api' || req.path.startsWith('/api/')) {
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
