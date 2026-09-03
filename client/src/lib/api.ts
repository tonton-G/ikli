export interface QrStyle {
  pattern: 'square' | 'rounded' | 'dots' | 'fluid' | 'diamond' | 'star'
  corners: 'square' | 'rounded' | 'leaf' | 'target'
  color: string
  color2: string | null // gradient end; null = solid
  gradient: 'linear' | 'radial'
  eyeColor: string | null // null = follow module color
  bg: string | null // null = transparent
  frame: 'none' | 'corner' | 'full' | 'scanme'
  frameText: string
  frameColor: string | null // null = follow module color
  logo: string | null // data:image/... URI or a short emoji
  logoSize: 'sm' | 'md' | 'lg' // share of the code the logo covers
}

export interface LinkPublic {
  slug: string
  longUrl: string
  createdAt: string
  expiresAt: string | null
  hasPassword: boolean
  qrStyle: QrStyle
}

export interface LinkCreated extends LinkPublic {
  editKey: string
}

export interface LinkStats {
  slug: string
  createdAt: string
  clicks: number
  uniques: number
  clicksByDay: Record<string, number>
  referrers: Record<string, number>
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
  ) {
    super(code)
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: { 'content-type': 'application/json' },
    ...init,
  })
  if (!res.ok) {
    let code = 'error'
    try {
      code = (await res.json()).error ?? code
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(res.status, code)
  }
  return res.status === 204 ? (undefined as T) : res.json()
}

export const api = {
  create: (url: string) =>
    request<LinkCreated>('/api/links', {
      method: 'POST',
      body: JSON.stringify({ url }),
    }),

  get: (slug: string) => request<LinkPublic>(`/api/links/${slug}`),

  stats: (slug: string) => request<LinkStats>(`/api/links/${slug}/stats`),

  verify: (slug: string, key: string) =>
    request<LinkPublic>(`/api/links/${slug}/verify`, {
      method: 'POST',
      body: JSON.stringify({ key }),
    }),

  update: (
    slug: string,
    key: string,
    changes: Partial<{
      url: string
      slug: string
      expiresAt: string | null
      password: string | null
      qrStyle: QrStyle
    }>,
  ) =>
    request<LinkPublic>(`/api/links/${slug}`, {
      method: 'PATCH',
      body: JSON.stringify({ key, ...changes }),
    }),

  remove: (slug: string, key: string) =>
    request<void>(`/api/links/${slug}`, {
      method: 'DELETE',
      body: JSON.stringify({ key }),
    }),
}

/** Base used for displaying/copying short URLs. In dev the redirect lives on the API server. */
export const SHORT_BASE_DISPLAY = 'ikli.com'
export function shortUrlFor(slug: string): string {
  if (import.meta.env.DEV) return `http://localhost:3001/${slug}`
  return `${window.location.origin}/${slug}`
}
