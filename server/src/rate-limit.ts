import { rateLimit, type Store } from 'express-rate-limit';
import type { RequestHandler } from 'express';
import { DynamoRateLimitStore } from './rate-limit-store.js';


const MINUTES = 60_000;

/** No-op middleware, for tests that drive more traffic from one address than a person could. */
const passthrough: RequestHandler = (_req, _res, next) => next();

export interface Limiters {
  /** Minting a link: the one unauthenticated write. */
  create: RequestHandler;
  /** Edit-key checks: verify, patch, delete. */
  auth: RequestHandler;
  /** The redirect hot path. */
  redirect: RequestHandler;
}

export function createLimiters(enabled: boolean, dynamoTable?: string): Limiters {
  if (!enabled) {
    return { create: passthrough, auth: passthrough, redirect: passthrough };
  }


  const shared = {
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    passOnStoreError: true,
  } as const;
  const json: RequestHandler = (_req, res) => {
    res.status(429).json({ error: 'rate_limited' });
  };

  const storeFor = (name: string): { store: Store } | {} =>
    dynamoTable ? { store: new DynamoRateLimitStore(dynamoTable, name) } : {};

  return {
    create: rateLimit({
      ...shared,
      ...storeFor('create'),
      windowMs: 10 * MINUTES,
      limit: 30,
      handler: json,
    }),

    auth: rateLimit({
      ...shared,
      ...storeFor('auth'),
      windowMs: 10 * MINUTES,
      limit: 20,
      skipSuccessfulRequests: true,
      handler: json,
    }),

    // Two DynamoDB writes per click, on the one route that has to stay fast for
    // everyone. Set where a person never reaches it and a script does in
    // seconds. Answers in text/plain: what lands here is a browser, not a client.
    redirect: rateLimit({
      ...shared,
      ...storeFor('redirect'),
      windowMs: 5 * MINUTES,
      limit: 600,
      handler: (_req, res) => {
        res.status(429).type('text/plain').send('Too many requests');
      },
    }),
  };
}
