import type { RequestHandler } from 'express';

/**
 *
 * Express 5 does this natively and this shim goes away with that upgrade. The
 * error handler it feeds does not: v5 forwards rejections to an error handler,
 * it does not write one for you.
 */
export const wrap =
  (handler: RequestHandler): RequestHandler =>
  (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
