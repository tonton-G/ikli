import { Link } from 'react-router-dom'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/** Square option tile used by the QR customizer. */
export function Tile({
  selected,
  onClick,
  className,
  children,
  label,
}: {
  selected: boolean
  onClick: () => void
  className?: string
  children: ReactNode
  label: string
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        'flex h-16 w-16 cursor-pointer items-center justify-center rounded-2xl border bg-paper transition-colors',
        selected
          ? 'border-[1.5px] border-ink'
          : 'border-ink/25 hover:border-ink/60',
        className,
      )}
    >
      {children}
    </button>
  )
}

export function Shell({
  right,
  children,
  kicker,
}: {
  right?: ReactNode
  children: ReactNode
  kicker?: string
}) {
  return (
    <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col px-6 sm:px-10">
      {kicker && (
        <div className="pt-4 font-mono text-xs tracking-widest text-muted uppercase">
          {kicker}
        </div>
      )}
      <header className="flex items-center justify-between py-8">
        <Link to="/" className="flex items-center gap-2.5">
          <svg
            viewBox="0 0 160 160"
            aria-hidden="true"
            className="h-[22px] w-[22px] text-ink"
          >
            <rect width="160" height="160" rx="38" fill="currentColor" />
            <path
              d="M60 130 L100 30"
              stroke="var(--color-paper)"
              strokeWidth="16"
              strokeLinecap="round"
            />
          </svg>
          <span className="font-display text-[26px] leading-none font-semibold">
            ikli
          </span>
        </Link>
        <div className="font-mono text-sm text-muted">{right}</div>
      </header>
      <main className="flex flex-1 flex-col pb-16">{children}</main>
    </div>
  )
}

/** Explicit Enter-to-submit for single-input forms (some environments skip the implicit submit). */
export function submitOnEnter(e: React.KeyboardEvent<HTMLInputElement>): void {
  if (e.key === 'Enter') {
    e.preventDefault()
    e.currentTarget.form?.requestSubmit()
  }
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}
