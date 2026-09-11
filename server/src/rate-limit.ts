import { rateLimit } from 'express-rate-limit';
import type { RequestHandler } from 'express';

/**
 * Per-IP limits. All three key on req.ip, which is only the real client when
 * 'trust proxy' matches the number of proxies actually in front of the app:
 * too high and a caller picks its own key by prepending a header, too low and
 * every visitor collapses into the load balancer's address. See AppOptions.
 *
 * The counters live in process memory, so the effective ceiling across the ASG
 * is (limit x running instances). That is accepted rather than solved: a shared
 * counter means a shared store, and the ones available here bill by the hour.
 */

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

export function createLimiters(enabled: boolean): Limiters {
  if (!enabled) {
    return { create: passthrough, auth: passthrough, redirect: passthrough };
  }

  // draft-7 emits one combined `RateLimit: limit=30, remaining=29, reset=60`
  // header alongside RateLimit-Policy. (Discrete RateLimit-Limit/-Remaining/
  // -Reset headers are draft-6; draft-8 swaps in quoted policy names and a
  // partition key.) legacyHeaders off: no X-RateLimit-* duplicates.
  const shared = { standardHeaders: 'draft-7', legacyHeaders: false } as const;
  const json: RequestHandler = (_req, res) => {
    res.status(429).json({ error: 'rate_limited' });
  };

  return {
    // Creating a link is an unauthenticated write to a pay-per-request table,
    // which makes it the only route where an anonymous caller spends money.
    // Well above what shortening links by hand looks like, flat against a loop.
    create: rateLimit({
      ...shared,
      windowMs: 10 * MINUTES,
      limit: 30,
      handler: json,
    }),

    // An edit key is ~176M combinations (140 x 9000 x 140) checked with a hash
    // compare, so request rate is the only thing between a guesser and someone
    // else's link. Successful requests are skipped deliberately: an owner
    // restyling a QR code sends a long run of valid PATCHes and must not be
    // locked out of their own link by using it.
    auth: rateLimit({
      ...shared,
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
      windowMs: 5 * MINUTES,
      limit: 600,
      handler: (_req, res) => {
        res.status(429).type('text/plain').send('Too many requests');
      },
    }),
  };
}
