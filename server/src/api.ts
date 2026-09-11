import { Router } from 'express';
import { generateEditKey, generateSlug, hashEditKey, verifyEditKey } from './keys.js';
import { wrap } from './async-handler.js';
import type { Limiters } from './rate-limit.js';
import {
  DEFAULT_QR_STYLE,
  withQrDefaults,
  type LinkRecord,
  type LinkStore,
  type QrStyle,
} from './types.js';

const SLUG_RE = /^[a-z0-9-]{3,32}$/;
const RESERVED_SLUGS = new Set(['api', 'edit', 'stats', 'assets']);

/**
 * Hosts a stored destination may never point at. Matched on the parsed hostname
 * only — nothing here resolves DNS, so a public name whose A record points at a
 * private address still passes. Closing that would mean resolving at redirect
 * time and re-checking every hop, which is a different control from this one.
 *
 * WHATWG URL parsing normalizes alternate IPv4 spellings before we see them, so
 * http://2130706433/ and http://0x7f.1/ both arrive here as 127.0.0.1, and a
 * bracketed [::ffff:169.254.169.254] arrives as [::ffff:a9fe:a9fe].
 */
function isBlockedHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, ''); // strip IPv6 brackets
  if (host === 'localhost' || host.endsWith('.localhost')) return true;
  if (host.endsWith('.local')) return true;
  if (host === '::1' || host === '0:0:0:0:0:0:0:1') return true;

  const v4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const [a, b] = v4.slice(1, 3).map(Number);
    if (a === 127) return true; // 127.0.0.0/8 loopback
    if (a === 10) return true; // 10.0.0.0/8
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
    if (a === 192 && b === 168) return true; // 192.168.0.0/16
    if (a === 169 && b === 254) return true; // 169.254.0.0/16, incl. the metadata endpoint
    return false;
  }

  const hextets = ipv6Hextets(host);
  if (!hextets) return false;
  const [h0, h1, h2, h3, h4, h5, h6, h7] = hextets;
  if ((h0 & 0xfe00) === 0xfc00) return true; // fc00::/7 unique local
  if ((h0 & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
  // ::ffff:a.b.c.d (and legacy ::a.b.c.d) embed a real IPv4 address — recheck it.
  if (h0 === 0 && h1 === 0 && h2 === 0 && h3 === 0 && h4 === 0 && (h5 === 0xffff || h5 === 0)) {
    return isBlockedHost(`${h6 >> 8}.${h6 & 0xff}.${h7 >> 8}.${h7 & 0xff}`);
  }
  return false;
}

/** Expands an IPv6 literal into its 8 hextets. Null if not well-formed IPv6. */
function ipv6Hextets(host: string): number[] | null {
  if (!host.includes(':') || !/^[0-9a-f:]+$/.test(host)) return null;
  const halves = host.split('::');
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(':') : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  if (halves.length === 1 && head.length !== 8) return null;
  if (head.length + tail.length > 7 && halves.length === 2) return null; // '::' needs room
  const pad = halves.length === 2 ? Array(8 - head.length - tail.length).fill('0') : [];
  const groups = [...head, ...pad, ...tail];
  return groups.length === 8 ? groups.map((g) => parseInt(g, 16)) : null;
}

function normalizeUrl(input: unknown): string | null {
  if (typeof input !== 'string' || input.length > 2048) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(input.trim()) ? input.trim() : `https://${input.trim()}`;
  try {
    const url = new URL(withScheme);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    if (isBlockedHost(url.hostname)) return null;
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
    ['sm', 'md', 'lg'].includes(s.logoSize) &&
    (s.logo === null ||
      (typeof s.logo === 'string' &&
        (LOGO_DATA_RE.test(s.logo) ? s.logo.length <= MAX_LOGO_CHARS : s.logo.length <= 8)));
  return ok ? s : null;
}

/**
 * shortUrl is minted from the configured base, never from the request host: a
 * QR code is a durable artifact, so a code generated while the app was reached
 * on the CloudFront domain must not encode a hostname that dies at teardown.
 */
function publicView(link: LinkRecord, baseUrl: string) {
  return {
    slug: link.slug,
    longUrl: link.longUrl,
    createdAt: link.createdAt,
    shortUrl: `${baseUrl}/${link.slug}`,
    qrStyle: withQrDefaults(link.qrStyle),
  };
}

export function createApiRouter(
  store: LinkStore,
  baseUrl: string,
  limiters: Limiters,
): Router {
  const router = Router();

  // The table also holds non-link items under keys no valid slug can produce.
  // and spares the store a lookup that can only miss.
  //
  // Lowercased here so it matches the redirect router's normalization.
  router.param('slug', (req, res, next, slug) => {
    const normalized = String(slug).toLowerCase();
    if (!SLUG_RE.test(normalized)) return res.status(404).json({ error: 'not_found' });
    req.params.slug = normalized;
    next();
  });

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

  router.post('/links', limiters.create, wrap(async (req, res) => {
    const longUrl = normalizeUrl(req.body?.url);
    if (!longUrl) return res.status(400).json({ error: 'invalid_url' });

    const editKey = generateEditKey();
    const editKeyHash = hashEditKey(editKey);

    // The conditional write IS the collision check. Asking get() first and then
    // writing leaves a window in which another instance mints the same slug and
    // one of the two links is silently overwritten. RESERVED_SLUGS stays a local
    // check: it is a fixed set, not a race.
    let slug = generateSlug();
    for (let tries = 0; ; tries++) {
      const link: LinkRecord = {
        slug,
        longUrl,
        editKeyHash,
        createdAt: new Date().toISOString(),
        qrStyle: { ...DEFAULT_QR_STYLE },
        clicks: 0,
        uniques: 0,
        clicksByDay: {},
        referrers: {},
      };
      if (!RESERVED_SLUGS.has(slug) && (await store.create(link))) {
        return res.status(201).json({ ...publicView(link, baseUrl), editKey });
      }
      if (tries >= 5) return res.status(503).json({ error: 'slug_space_exhausted' });
      slug = generateSlug(tries >= 3 ? 5 : 4);
    }
  }));

  // Public metadata: destination, QR style, age.
  router.get('/links/:slug', wrap(async (req, res) => {
    const link = await store.get(req.params.slug);
    if (!link) return res.status(404).json({ error: 'not_found' });
    res.json(publicView(link, baseUrl));
  }));

  router.get('/links/:slug/stats', wrap(async (req, res) => {
    const link = await store.get(req.params.slug);
    if (!link) return res.status(404).json({ error: 'not_found' });
    res.json({
      slug: link.slug,
      createdAt: link.createdAt,
      clicks: link.clicks,
      uniques: link.uniques ?? 0,
      clicksByDay: link.clicksByDay,
      referrers: link.referrers,
    });
  }));

  router.post('/links/:slug/verify', limiters.auth, wrap(async (req, res) => {
    const link = await authed(req, res);
    if (!link) return;
    res.json(publicView(link, baseUrl));
  }));

  router.patch('/links/:slug', limiters.auth, wrap(async (req, res) => {
    const link = await authed(req, res);
    if (!link) return;
    const body = req.body ?? {};

    if (body.url !== undefined) {
      const longUrl = normalizeUrl(body.url);
      if (!longUrl) return res.status(400).json({ error: 'invalid_url' });
      link.longUrl = longUrl;
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
      // Field edits ride along in the same store call as the rename, so both
      // land together or not at all.
      const updated: LinkRecord = { ...link, slug: newSlug };
      const ok = await store.rename(link.slug, newSlug, updated);
      if (!ok) return res.status(409).json({ error: 'slug_taken' });
      return res.json(publicView(updated, baseUrl));
    }

    await store.put(link);
    res.json(publicView(link, baseUrl));
  }));

  router.delete('/links/:slug', limiters.auth, wrap(async (req, res) => {
    const link = await authed(req, res);
    if (!link) return;
    await store.delete(link.slug);
    res.status(204).end();
  }));

  // Anything under /api that matched no route above stops here. Without this it
  // falls through to the SPA fallback and a fetch() caller gets 200 text/html,
  // which fails at .json() instead of surfacing the 404 it actually got.
  router.use((_req, res) => res.status(404).json({ error: 'not_found' }));

  return router;
}
