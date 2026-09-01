import express, { type Express } from 'express';
import { createApiRouter } from './api.js';
import { createRedirectRouter } from './redirect.js';
import type { LinkStore } from './types.js';

export function createApp(store: LinkStore): Express {
  const app = express();
  app.set('trust proxy', true);
  app.use(express.json({ limit: '256kb' })); // headroom for QR logo data URIs
  app.use(express.urlencoded({ extended: false }));

  app.get('/api/health', (_req, res) => res.json({ ok: true }));
  app.use('/api', createApiRouter(store));
  app.use('/', createRedirectRouter(store));

  return app;
}
