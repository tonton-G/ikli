import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api, shortHost, type QrStyle } from '@/lib/api'
import { recallKey } from '@/lib/session'
import { renderQrSvg, downloadPng, downloadSvg } from '@/lib/qr'
import { Shell, Tile } from '@/components/shell'
import { EmojiPicker } from '@/components/emoji-picker'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const PRESET_COLORS = ['#1a1a1a', '#4a72d8', '#2f7d5c', '#8b5cf6', '#d1495b']
const EMOJI_PRESETS = ['🔗', '⭐', '❤️', '🚀', '🍕', '🎧']
const MAX_LOGO_CHARS = 90_000
// Downscale ladder for uploads: first square cap rule
const LOGO_SIDES = [256, 192, 144, 112, 80, 56]
const LOGO_SIZE_LABELS = { sm: 'small', md: 'medium', lg: 'large' } as const

/* ---------- option glyphs ---------- */

function PatternGlyph({ kind }: { kind: QrStyle['pattern'] }) {
  const cells: [number, number][] = [
    [0, 0],
    [2, 0],
    [1, 1],
    [0, 2],
    [2, 2],
  ]
  if (kind === 'fluid')
    return (
      <svg width="30" height="30" viewBox="0 0 30 30">
        <path
          d="M3 3 h16 a4 4 0 0 1 4 4 v16 a4 4 0 0 1 -4 4 h-6 a4 4 0 0 1 -4 -4 v-6 a4 4 0 0 0 -4 -4 h-2 a4 4 0 0 1 -4 -4 v-2 a4 4 0 0 1 4 -4 z"
          transform="scale(0.85) translate(2.6 2.6)"
          fill="#1a1a1a"
        />
      </svg>
    )
  return (
    <svg width="30" height="30" viewBox="0 0 30 30">
      {cells.map(([cx, cy]) => {
        const x = cx * 10 + 5
        const y = cy * 10 + 5
        if (kind === 'dots')
          return (
            <circle key={`${cx}${cy}`} cx={x} cy={y} r="3.4" fill="#1a1a1a" />
          )
        if (kind === 'diamond')
          return (
            <path
              key={`${cx}${cy}`}
              d={`M${x},${y - 4.4} L${x + 4.4},${y} L${x},${y + 4.4} L${x - 4.4},${y} z`}
              fill="#1a1a1a"
            />
          )
        if (kind === 'star')
          return (
            <path
              key={`${cx}${cy}`}
              d={`M${x},${y - 4.6} Q${x + 1.4},${y - 1.4} ${x + 4.6},${y} Q${x + 1.4},${y + 1.4} ${x},${y + 4.6} Q${x - 1.4},${y + 1.4} ${x - 4.6},${y} Q${x - 1.4},${y - 1.4} ${x},${y - 4.6} z`}
              fill="#1a1a1a"
            />
          )
        return (
          <rect
            key={`${cx}${cy}`}
            x={cx * 10 + 1.5}
            y={cy * 10 + 1.5}
            width="7"
            height="7"
            rx={kind === 'rounded' ? 2.6 : 0.5}
            fill="#1a1a1a"
          />
        )
      })}
    </svg>
  )
}

function CornerGlyph({ kind }: { kind: QrStyle['corners'] }) {
  if (kind === 'rounded')
    return (
      <svg width="26" height="26" viewBox="0 0 26 26">
        <rect
          x="2"
          y="2"
          width="22"
          height="22"
          rx="8"
          fill="none"
          stroke="#1a1a1a"
          strokeWidth="3"
        />
        <circle cx="13" cy="13" r="4" fill="#1a1a1a" />
      </svg>
    )
  if (kind === 'leaf')
    return (
      <svg width="26" height="26" viewBox="0 0 26 26">
        <path
          d="M2 2 h14 a8 8 0 0 1 8 8 v14 h-14 a8 8 0 0 1 -8 -8 z"
          fill="none"
          stroke="#1a1a1a"
          strokeWidth="3"
        />
        <path
          d="M9 9 h5 a3 3 0 0 1 3 3 v5 h-5 a3 3 0 0 1 -3 -3 z"
          fill="#1a1a1a"
        />
      </svg>
    )
  if (kind === 'target')
    return (
      <svg width="26" height="26" viewBox="0 0 26 26">
        <circle
          cx="13"
          cy="13"
          r="10"
          fill="none"
          stroke="#1a1a1a"
          strokeWidth="3"
        />
        <circle cx="13" cy="13" r="4" fill="#1a1a1a" />
      </svg>
    )
  return (
    <svg width="26" height="26" viewBox="0 0 26 26">
      <rect
        x="2"
        y="2"
        width="22"
        height="22"
        fill="none"
        stroke="#1a1a1a"
        strokeWidth="3"
      />
      <rect x="9.5" y="9.5" width="7" height="7" fill="#1a1a1a" />
    </svg>
  )
}

function FrameGlyph({ kind }: { kind: QrStyle['frame'] }) {
  if (kind === 'none')
    return <span className="font-mono text-xs text-muted">none</span>
  if (kind === 'corner')
    return (
      <svg width="28" height="28" viewBox="0 0 28 28">
        <path
          d="M4 18 V4 H18"
          fill="none"
          stroke="#1a1a1a"
          strokeWidth="3"
          strokeLinecap="round"
        />
      </svg>
    )
  if (kind === 'full')
    return (
      <svg width="28" height="28" viewBox="0 0 28 28">
        <rect
          x="3"
          y="3"
          width="22"
          height="22"
          fill="none"
          stroke="#1a1a1a"
          strokeWidth="3"
        />
      </svg>
    )
  return (
    <span className="flex flex-col items-center gap-1">
      <span className="h-2.5 w-9 rounded-full bg-faint" />
      <span className="font-display text-sm leading-none font-semibold">
        Scan me
      </span>
    </span>
  )
}

/* ---------- small controls ---------- */

function Swatch({
  color,
  selected,
  onClick,
  label,
}: {
  color: string
  selected: boolean
  onClick: () => void
  label: string
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        'h-8 w-8 cursor-pointer rounded-full transition-transform active:scale-90',
        selected && 'ring-2 ring-ink ring-offset-[3px]',
        color.toLowerCase() === '#ffffff' && 'border border-ink/20',
      )}
      style={{ background: color }}
    />
  )
}

function CustomSwatch({
  value,
  active,
  onPick,
  label,
}: {
  value: string
  active: boolean
  onPick: (hex: string) => void
  label: string
}) {
  const ref = useRef<HTMLInputElement>(null)
  return (
    <button
      type="button"
      aria-label={label}
      onClick={() => ref.current?.click()}
      className={cn(
        'relative flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border-[1.5px] border-dashed border-muted text-sm text-muted',
        active && 'ring-2 ring-ink ring-offset-[3px]',
      )}
      style={
        active
          ? { background: value, color: '#fff', borderStyle: 'solid' }
          : undefined
      }
    >
      +
      <input
        ref={ref}
        type="color"
        value={value}
        onChange={(e) => onPick(e.target.value)}
        className="absolute inset-0 cursor-pointer opacity-0"
        tabIndex={-1}
      />
    </button>
  )
}

/** "match"/"white"/"off"-style pill used next to swatch rows. */
function TextPill({
  label,
  selected,
  onClick,
}: {
  label: string
  selected: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        'cursor-pointer rounded-full border-[1.5px] px-4 py-1 font-mono text-xs',
        selected
          ? 'border-ink text-ink'
          : 'border-ink/25 text-muted hover:border-ink/60',
      )}
    >
      {label}
    </button>
  )
}

function Section({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <section>
      <p className="mb-3 font-mono text-sm text-muted">{label}</p>
      {children}
    </section>
  )
}

/* ---------- logo upload ---------- */

function readDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error('read failed'))
    reader.readAsDataURL(file)
  })
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('decode failed'))
    img.src = src
  })
}

/** Center-fit onto a square canvas. PNG out, so transparency survives. */
function squarePng(img: HTMLImageElement, side: number): string {
  const canvas = document.createElement('canvas')
  canvas.width = side
  canvas.height = side
  const ctx = canvas.getContext('2d')!
  const iw = img.naturalWidth || side // SVGs can report no intrinsic size
  const ih = img.naturalHeight || side
  const scale = Math.min(side / iw, side / ih)
  const w = iw * scale
  const h = ih * scale
  ctx.drawImage(img, (side - w) / 2, (side - h) / 2, w, h)
  return canvas.toDataURL('image/png')
}

/** Any upload becomes a logo: shrink down the ladder until it fits the cap. */
async function fileToLogo(file: File): Promise<string> {
  const original = await readDataUrl(file)
  // an SVG that already fits stays vector — nothing to gain by rasterizing
  if (file.type === 'image/svg+xml' && original.length <= MAX_LOGO_CHARS)
    return original
  const img = await loadImage(original)
  for (const side of LOGO_SIDES) {
    const uri = squarePng(img, side)
    if (uri.length <= MAX_LOGO_CHARS) return uri
  }
  throw new Error('too big')
}

/* ---------- page ---------- */

export default function QrCustomize() {
  const { slug = '' } = useParams()
  const [style, setStyle] = useState<QrStyle | null>(null)
  // Kept alongside the style: this is what the code encodes, and it has to come
  // from the server rather than this page's origin.
  const [shortUrl, setShortUrl] = useState('')
  const [format, setFormat] = useState<'png' | 'svg'>('png')
  const [logoError, setLogoError] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const editKey = recallKey(slug)

  useEffect(() => {
    api
      .get(slug)
      .then((link) => {
        setStyle(link.qrStyle)
        setShortUrl(link.shortUrl)
      })
      .catch(() => setStyle(null))
  }, [slug])

  const qrSvg = useMemo(
    () => (style && shortUrl ? renderQrSvg(shortUrl, style) : ''),
    [style, shortUrl],
  )

  function apply(patch: Partial<QrStyle>) {
    setStyle((prev) => {
      if (!prev) return prev
      const next = { ...prev, ...patch }
      // Persist with the link when we hold the key; otherwise it's a local preview.
      if (editKey) api.update(slug, editKey, { qrStyle: next }).catch(() => {})
      return next
    })
  }

  async function onUpload(file: File | undefined) {
    if (!file) return
    setLogoError(false)
    try {
      apply({ logo: await fileToLogo(file) })
    } catch {
      setLogoError(true)
    }
  }

  if (!style) return <Shell right={null}>{null}</Shell>

  const customColor = !PRESET_COLORS.includes(style.color)
  const uploadedLogo = style.logo?.startsWith('data:image/') ?? false
  const customEmoji =
    style.logo !== null && !uploadedLogo && !EMOJI_PRESETS.includes(style.logo)

  return (
    <Shell
      right={
        <Link to={`/${slug}/done`} className="hover:text-ink">
          ← back to link
        </Link>
      }
    >
      <div className="grid gap-10 sm:grid-cols-[minmax(0,15rem)_1fr]">
        <div className="sm:sticky sm:top-6 sm:self-start">
          <div
            aria-label="QR preview"
            className={cn(
              'aspect-square w-full rounded-3xl border-[1.5px] border-ink p-4 [&>svg]:h-full [&>svg]:w-full',
              style.bg === null &&
                'bg-[conic-gradient(#eee_0_25%,#fff_0_50%,#eee_0_75%,#fff_0)] bg-[length:16px_16px]',
            )}
            dangerouslySetInnerHTML={{ __html: qrSvg }}
          />
          <p className="mt-4 font-mono text-sm text-muted">
            {shortHost(shortUrl)}/{slug}
          </p>
        </div>

        <div className="flex flex-col gap-7">
          <Section label="pattern">
            <div className="flex flex-wrap gap-3">
              {(
                [
                  'square',
                  'rounded',
                  'dots',
                  'fluid',
                  'diamond',
                  'star',
                ] as const
              ).map((p) => (
                <Tile
                  key={p}
                  label={`${p} pattern`}
                  selected={style.pattern === p}
                  onClick={() => apply({ pattern: p })}
                >
                  <PatternGlyph kind={p} />
                </Tile>
              ))}
            </div>
          </Section>

          <Section label="corners">
            <div className="flex flex-wrap gap-3">
              {(['square', 'rounded', 'leaf', 'target'] as const).map((c) => (
                <Tile
                  key={c}
                  label={`${c} corners`}
                  selected={style.corners === c}
                  onClick={() => apply({ corners: c })}
                >
                  <CornerGlyph kind={c} />
                </Tile>
              ))}
            </div>
          </Section>

          <div className="flex flex-wrap gap-x-12 gap-y-7">
            <Section label="color">
              <div className="flex items-center gap-2.5">
                {PRESET_COLORS.map((c) => (
                  <Swatch
                    key={c}
                    color={c}
                    label={`color ${c}`}
                    selected={style.color === c}
                    onClick={() => apply({ color: c })}
                  />
                ))}
                <CustomSwatch
                  value={style.color}
                  active={customColor}
                  onPick={(hex) => apply({ color: hex })}
                  label="custom color"
                />
              </div>
            </Section>

            <Section label="gradient">
              <div className="flex items-center gap-2.5">
                <TextPill
                  label="off"
                  selected={style.color2 === null}
                  onClick={() => apply({ color2: null })}
                />
                {(['linear', 'radial'] as const).map((g) => (
                  <TextPill
                    key={g}
                    label={g}
                    selected={style.color2 !== null && style.gradient === g}
                    onClick={() =>
                      apply({ gradient: g, color2: style.color2 ?? '#8b5cf6' })
                    }
                  />
                ))}
                {style.color2 !== null && (
                  <CustomSwatch
                    value={style.color2}
                    active
                    onPick={(hex) => apply({ color2: hex })}
                    label="gradient end color"
                  />
                )}
              </div>
            </Section>
          </div>

          <div className="flex flex-wrap gap-x-12 gap-y-7">
            <Section label="eyes">
              <div className="flex items-center gap-2.5">
                <TextPill
                  label="match"
                  selected={style.eyeColor === null}
                  onClick={() => apply({ eyeColor: null })}
                />
                <CustomSwatch
                  value={style.eyeColor ?? style.color}
                  active={style.eyeColor !== null}
                  onPick={(hex) => apply({ eyeColor: hex })}
                  label="eye color"
                />
              </div>
            </Section>

            <Section label="background">
              <div className="flex items-center gap-2.5">
                <Swatch
                  color="#ffffff"
                  label="white background"
                  selected={style.bg === '#ffffff'}
                  onClick={() => apply({ bg: '#ffffff' })}
                />
                <TextPill
                  label="transparent"
                  selected={style.bg === null}
                  onClick={() => apply({ bg: null })}
                />
                <CustomSwatch
                  value={style.bg ?? '#ffffff'}
                  active={style.bg !== null && style.bg !== '#ffffff'}
                  onPick={(hex) => apply({ bg: hex })}
                  label="background color"
                />
              </div>
            </Section>
          </div>

          <Section label="logo">
            <div className="flex flex-wrap items-center gap-2.5">
              <TextPill
                label="none"
                selected={style.logo === null}
                onClick={() => apply({ logo: null })}
              />
              {EMOJI_PRESETS.map((e) => (
                <button
                  key={e}
                  type="button"
                  aria-label={`logo ${e}`}
                  aria-pressed={style.logo === e}
                  onClick={() => apply({ logo: e })}
                  className={cn(
                    'flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border text-lg transition-transform active:scale-90',
                    style.logo === e
                      ? 'border-[1.5px] border-ink'
                      : 'border-ink/20 hover:border-ink/60',
                  )}
                >
                  {e}
                </button>
              ))}
              <EmojiPicker
                active={customEmoji}
                current={customEmoji ? style.logo : null}
                onPick={(emoji) => apply({ logo: emoji })}
              />
              <button
                type="button"
                aria-label="upload logo"
                onClick={() => fileInput.current?.click()}
                className={cn(
                  'flex h-9 cursor-pointer items-center justify-center overflow-hidden rounded-full border-[1.5px] border-dashed border-muted px-3 font-mono text-xs text-muted hover:border-ink/60 hover:text-ink',
                  uploadedLogo && 'border-solid border-ink text-ink',
                )}
              >
                {uploadedLogo ? (
                  <img
                    src={style.logo!}
                    alt="uploaded logo"
                    className="h-6 w-6 object-contain"
                  />
                ) : (
                  'upload'
                )}
              </button>
              <input
                ref={fileInput}
                type="file"
                accept="image/png,image/jpeg,image/svg+xml"
                className="hidden"
                onChange={(e) => {
                  onUpload(e.target.files?.[0])
                  e.target.value = ''
                }}
              />
            </div>
            {style.logo !== null && (
              <div className="mt-3 flex items-center gap-2.5">
                <span className="font-mono text-xs text-muted">size</span>
                {(['sm', 'md', 'lg'] as const).map((s) => (
                  <TextPill
                    key={s}
                    label={LOGO_SIZE_LABELS[s]}
                    selected={style.logoSize === s}
                    onClick={() => apply({ logoSize: s })}
                  />
                ))}
              </div>
            )}
            {logoError && (
              <p className="mt-2 font-mono text-xs text-danger">
                couldn't read that image — try a PNG, JPEG, or SVG
              </p>
            )}
          </Section>

          <Section label="frame">
            <div className="flex flex-wrap items-center gap-3">
              {(['none', 'corner', 'full', 'scanme'] as const).map((f) => (
                <Tile
                  key={f}
                  label={`${f} frame`}
                  selected={style.frame === f}
                  onClick={() => apply({ frame: f })}
                  className="h-[76px] w-[76px]"
                >
                  <FrameGlyph kind={f} />
                </Tile>
              ))}
              {style.frame !== 'none' && (
                <div className="flex items-center gap-2.5 pl-2">
                  <span className="font-mono text-xs text-muted">tint</span>
                  <TextPill
                    label="match"
                    selected={style.frameColor === null}
                    onClick={() => apply({ frameColor: null })}
                  />
                  <CustomSwatch
                    value={style.frameColor ?? style.color}
                    active={style.frameColor !== null}
                    onPick={(hex) => apply({ frameColor: hex })}
                    label="frame color"
                  />
                </div>
              )}
            </div>
            {style.frame === 'scanme' && (
              <input
                value={style.frameText}
                maxLength={24}
                onChange={(e) => apply({ frameText: e.target.value })}
                placeholder="Scan me"
                aria-label="Frame label text"
                className="font-display mt-4 w-56 rounded-2xl border-[1.5px] border-ink bg-paper px-4 py-2 text-xl font-semibold outline-none placeholder:text-muted"
              />
            )}
          </Section>
        </div>
      </div>

      <div className="mt-14 flex flex-wrap items-end gap-x-10 gap-y-6">
        <div className="flex flex-col gap-4">
          <Button
            size="lg"
            className="px-14"
            onClick={() =>
              format === 'png'
                ? downloadPng(qrSvg, `ikli-${slug}.png`)
                : downloadSvg(qrSvg, `ikli-${slug}.svg`)
            }
          >
            Download
          </Button>
          <div className="flex gap-3">
            {(['png', 'svg'] as const).map((f) => (
              <button
                key={f}
                type="button"
                aria-pressed={format === f}
                onClick={() => setFormat(f)}
                className={cn(
                  'cursor-pointer rounded-full border-[1.5px] px-6 py-1.5 font-mono text-xs uppercase',
                  format === f
                    ? 'border-ink text-ink'
                    : 'border-ink/25 text-muted hover:border-ink/60',
                )}
              >
                {f}
              </button>
            ))}
          </div>
        </div>
        <p className="max-w-xs font-mono text-sm leading-relaxed text-muted">
          {editKey
            ? 'style is saved with the link — reprint-safe, slug never changes'
            : 'no edit key in this session — style changes preview & download only'}
        </p>
      </div>
    </Shell>
  )
}
