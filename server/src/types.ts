export interface QrStyle {
  pattern: 'square' | 'rounded' | 'dots' | 'fluid' | 'diamond' | 'star';
  corners: 'square' | 'rounded' | 'leaf' | 'target';
  color: string;
  /** Gradient end color; null = solid fill. */
  color2: string | null;
  gradient: 'linear' | 'radial';
  /** Eye (finder) color; null = follow the module color/gradient. */
  eyeColor: string | null;
  /** Background; null = transparent. */
  bg: string | null;
  frame: 'none' | 'corner' | 'full' | 'scanme';
  /** Label text for the 'scanme' frame. */
  frameText: string;
  /** Frame stroke/label color; null = follow the module color. */
  frameColor: string | null;
  /** Center logo: a data:image/... URI, or a short emoji string. null = none. */
  logo: string | null;
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
  expiresAt: string | null; // ISO
  passwordHash: string | null; // scrypt "salt:hash"
  qrStyle: QrStyle;
  clicks: number;
  clicksByDay: Record<string, number>; // YYYY-MM-DD -> count
  visitorHashes: string[]; // for unique counting
  referrers: Record<string, number>; // host -> count, '' = direct
}

export interface LinkStore {
  get(slug: string): Promise<LinkRecord | null>;
  put(link: LinkRecord): Promise<void>;
  /** Atomically move a record to a new slug. Returns false if newSlug is taken. */
  rename(oldSlug: string, newSlug: string): Promise<boolean>;
  delete(slug: string): Promise<void>;
}
