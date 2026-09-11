export interface QrStyle {
  pattern: 'square' | 'rounded' | 'dots' | 'fluid' | 'diamond' | 'star';
  corners: 'square' | 'rounded' | 'leaf' | 'target';
  color: string;
  color2: string | null;
  gradient: 'linear' | 'radial';
  eyeColor: string | null;
  bg: string | null;
  frame: 'none' | 'corner' | 'full' | 'scanme';
  frameText: string;
  frameColor: string | null;
  logo: string | null;
  logoSize: 'sm' | 'md' | 'lg';
}

export const DEFAULT_QR_STYLE: QrStyle = {
  pattern: 'square',
  corners: 'square',
  color: '#1a1a1a',
  color2: null,
  gradient: 'linear',
  eyeColor: null,
  bg: '#ffffff',
  frame: 'none',
  frameText: 'Scan me',
  frameColor: null,
  logo: null,
  logoSize: 'md',
};

/** Fill in defaults for records saved before newer style fields existed. */
export function withQrDefaults(style: Partial<QrStyle> | undefined): QrStyle {
  return { ...DEFAULT_QR_STYLE, ...(style ?? {}) };
}

export interface LinkRecord {
  slug: string;
  longUrl: string;
  editKeyHash: string;
  createdAt: string; // ISO
  qrStyle: QrStyle;
  clicks: number;
  /** Distinct visitors within UNIQUE_WINDOW_DAYS. Per-visitor markers live outside this record. */
  uniques: number;
  clicksByDay: Record<string, number>; // YYYY-MM-DD -> count
  referrers: Record<string, number>; // host -> count, '' = direct, OTHER_REFERRER = overflow
}

/**
 * The referrer map is written from the Referer header on an unauthenticated
 * path, so its key space has to be capped or anyone can grow the record until
 * DynamoDB refuses every further write to it. The first REFERRER_CAP distinct
 * hosts get their own key; everything after that folds into OTHER_REFERRER.
 */
export const REFERRER_CAP = 50;
export const OTHER_REFERRER = '(other)';

/** How long a visitor marker lives, and therefore what "unique" means. */
export const UNIQUE_WINDOW_DAYS = 30;

/** One visit to a short link, already reduced to the fields stats care about. */
export interface Visit {
  day: string; // YYYY-MM-DD bucket the click belongs to
  visitor: string; // opaque per-visitor hash, only ever compared for equality
  referrer: string; // referring host, '' for direct
}

export interface LinkStore {
  get(slug: string): Promise<LinkRecord | null>;
  /**
   * Create only if the slug is unclaimed; returns false if it's already taken.
   * This is the collision check for slug minting — a get() first here would be
   * a read-then-write race across instances.
   */
  create(link: LinkRecord): Promise<boolean>;
  put(link: LinkRecord): Promise<void>;
  /**
   * Atomically move a record to a new slug. If `updated` is given, it's
   * persisted at newSlug instead of a fresh read of the current record — so
   * field edits ride along with the rename instead of a second write.
   * Returns false if newSlug is taken.
   */
  rename(oldSlug: string, newSlug: string, updated?: LinkRecord): Promise<boolean>;
  delete(slug: string): Promise<void>;
  /**
   * Fold one visit into the stored counters atomically. Implementations must not
   * read-modify-write the record: visits arrive concurrently across instances and
   * every one of them has to be counted.
   */
  recordVisit(slug: string, visit: Visit): Promise<void>;
}
