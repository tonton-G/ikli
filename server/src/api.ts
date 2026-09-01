import { Router } from 'express';
import {
  generateEditKey,
  generateSlug,
  hashEditKey,
  hashPassword,
  verifyEditKey,
} from './keys.js';
import {
  DEFAULT_QR_STYLE,
  withQrDefaults,
  type LinkRecord,
  type LinkStore,
  type QrStyle,
} from './types.js';

const SLUG_RE = /^[a-z0-9-]{3,32}$/;
const RESERVED_SLUGS = new Set(['api', 'edit', 'stats', 'assets']);

function normalizeUrl(input: unknown): string | null {
  if (typeof input !== 'string' || input.length > 2048) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(input.trim()) ? input.trim() : `https://${input.trim()}`;
  try {
    const url = new URL(withScheme);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.href;
  } catch {
    return null;
  }
}

const HEX_RE = /^#[0-9a-fA-F]{6}$/;
const LOGO_DATA_RE = /^data:image\/(png|jpeg|svg\+xml);base64,[A-Za-z0-9+/=]+$/;
const MAX_LOGO_CHARS = 90_000; // ~64KB of image, base64-encoded

/** Validate a client-sent style, filling defaults for omitted fields. Returns null if invalid. */
function normalizeQrStyle(input: any): QrStyle | null {
  if (typeof input !== 'object' || input === null) return null;
  const s = withQrDefaults(input);
  const hex = (v: unknown) => typeof v === 'string' && HEX_RE.test(v);
  const hexOrNull = (v: unknown) => v === null || hex(v);
  const ok =
    ['square', 'rounded', 'dots', 'fluid', 'diamond', 'star'].includes(s.pattern) &&
    ['square', 'rounded', 'leaf', 'target'].includes(s.corners) &&
    hex(s.color) &&
    hexOrNull(s.color2) &&
    ['linear', 'radial'].includes(s.gradient) &&
    hexOrNull(s.eyeColor) &&
    hexOrNull(s.bg) &&
    ['none', 'corner', 'full', 'scanme'].includes(s.frame) &&
    typeof s.frameText === 'string' &&
    s.frameText.length <= 24 &&
    hexOrNull(s.frameColor) &&
    (s.logo === null ||
      (typeof s.logo === 'string' &&
        (LOGO_DATA_RE.test(s.logo) ? s.logo.length <= MAX_LOGO_CHARS : s.logo.length <= 8)));
  return ok ? s : null;
}

function publicView(link: LinkRecord) {
  return {
    slug: link.slug,
    longUrl: link.longUrl,
    createdAt: link.createdAt,
    expiresAt: link.expiresAt,
    hasPassword: link.passwordHash !== null,
    qrStyle: withQrDefaults(link.qrStyle),
  };
}

export function createApiRouter(store: LinkStore): Router {
  const router = Router();

  // Loads the link and verifies the edit key from the request body.
  async function authed(req: any, res: any): Promise<LinkRecord | null> {
    const link = await store.get(req.params.slug);
    if (!link) {
      res.status(404).json({ error: 'not_found' });
      return null;
    }
    const key = req.body?.key;
    if (typeof key !== 'string' || !verifyEditKey(key, link.editKeyHash)) {
      res.status(403).json({ error: 'bad_key' });
      return null;
    }
    return link;
  }

  router.post('/links', async (req, res) => {
    const longUrl = normalizeUrl(req.body?.url);
    if (!longUrl) return res.status(400).json({ error: 'invalid_url' });

    let slug = generateSlug();
    for (let tries = 0; (await store.get(slug)) || RESERVED_SLUGS.has(slug); tries++) {
      if (tries >= 5) return res.status(503).json({ error: 'slug_space_exhausted' });
      slug = generateSlug(tries >= 3 ? 5 : 4);
    }

    const editKey = generateEditKey();
    const link: LinkRecord = {
      slug,
      longUrl,
      editKeyHash: hashEditKey(editKey),
      createdAt: new Date().toISOString(),
      expiresAt: null,
      passwordHash: null,
      qrStyle: { ...DEFAULT_QR_STYLE },
      clicks: 0,
      clicksByDay: {},
      visitorHashes: [],
      referrers: {},
    };
    await store.put(link);
    res.status(201).json({ ...publicView(link), editKey });
  });

  // Public metadata (QR style, expiry, age). The destination is only included
  // for links without a password — a password gate must not leak the target.
  router.get('/links/:slug', async (req, res) => {
    const link = await store.get(req.params.slug);
    if (!link) return res.status(404).json({ error: 'not_found' });
    const view = publicView(link);
    res.json(link.passwordHash ? { ...view, longUrl: null } : view);
  });

  router.get('/links/:slug/stats', async (req, res) => {
    const link = await store.get(req.params.slug);
    if (!link) return res.status(404).json({ error: 'not_found' });
    res.json({
      slug: link.slug,
      createdAt: link.createdAt,
      clicks: link.clicks,
      uniques: link.visitorHashes.length,
      clicksByDay: link.clicksByDay,
      referrers: link.referrers,
    });
  });

  router.post('/links/:slug/verify', async (req, res) => {
    const link = await authed(req, res);
    if (!link) return;
    res.json(publicView(link));
  });

  router.patch('/links/:slug', async (req, res) => {
    const link = await authed(req, res);
    if (!link) return;
    const body = req.body ?? {};

    if (body.url !== undefined) {
      const longUrl = normalizeUrl(body.url);
      if (!longUrl) return res.status(400).json({ error: 'invalid_url' });
      link.longUrl = longUrl;
    }

    if (body.expiresAt !== undefined) {
      if (body.expiresAt === null) {
        link.expiresAt = null;
      } else {
        const ts = Date.parse(body.expiresAt);
        if (Number.isNaN(ts)) return res.status(400).json({ error: 'invalid_expiry' });
        link.expiresAt = new Date(ts).toISOString();
      }
    }

    if (body.password !== undefined) {
      if (body.password === null || body.password === '') {
        link.passwordHash = null;
      } else if (typeof body.password === 'string' && body.password.length <= 128) {
        link.passwordHash = hashPassword(body.password);
      } else {
        return res.status(400).json({ error: 'invalid_password' });
      }
    }

    if (body.qrStyle !== undefined) {
      const style = normalizeQrStyle(body.qrStyle);
      if (!style) return res.status(400).json({ error: 'invalid_qr_style' });
      link.qrStyle = style;
    }

    if (body.slug !== undefined && body.slug !== link.slug) {
      const newSlug = String(body.slug).toLowerCase();
      if (!SLUG_RE.test(newSlug) || RESERVED_SLUGS.has(newSlug)) {
        return res.status(400).json({ error: 'invalid_slug' });
      }
      await store.put(link); // persist field edits under the old slug first
      const ok = await store.rename(link.slug, newSlug);
      if (!ok) return res.status(409).json({ error: 'slug_taken' });
      const renamed = await store.get(newSlug);
      return res.json(publicView(renamed!));
    }

    await store.put(link);
    res.json(publicView(link));
  });

  router.delete('/links/:slug', async (req, res) => {
    const link = await authed(req, res);
    if (!link) return;
    await store.delete(link.slug);
    res.status(204).end();
  });

  return router;
}
