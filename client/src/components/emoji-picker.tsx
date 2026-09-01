import { useEffect, useMemo, useRef, useState } from 'react'
import { EMOJI_GROUPS, searchEmoji } from '@/lib/emoji'
import { cn } from '@/lib/utils'

/** "+" trigger that opens a searchable emoji grid, mirroring the custom-color swatch. */
export function EmojiPicker({
  active,
  current,
  onPick,
}: {
  active: boolean
  current: string | null
  onPick: (emoji: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const wrap = useRef<HTMLDivElement>(null)
  const search = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    search.current?.focus()
    const dismiss = () => {
      setOpen(false)
      setQuery('')
    }
    const onDown = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) dismiss()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') dismiss()
    }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const results = useMemo(() => searchEmoji(query), [query])
  const searching = query.trim().length > 0

  function choose(emoji: string) {
    onPick(emoji)
    setOpen(false)
    setQuery('')
  }

  return (
    <div ref={wrap} className="relative">
      <button
        type="button"
        aria-label="custom emoji"
        aria-expanded={open}
        onClick={() => {
          setOpen((v) => !v)
          setQuery('')
        }}
        className={cn(
          'flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border-[1.5px] border-dashed border-muted text-sm text-muted transition-transform active:scale-90 hover:border-ink/60 hover:text-ink',
          active && 'border-solid border-ink text-lg text-ink',
        )}
      >
        {active ? current : '+'}
      </button>

      {open && (
        <div className="absolute top-11 left-0 z-20 w-[19.5rem] rounded-2xl border-[1.5px] border-ink bg-paper p-3 shadow-[0_8px_28px_rgba(0,0,0,0.12)]">
          <input
            ref={search}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="search"
            aria-label="Search emoji"
            className="mb-2 w-full rounded-xl border-[1.5px] border-ink/25 bg-paper px-3 py-1.5 font-mono text-xs outline-none placeholder:text-muted focus:border-ink"
          />
          <div className="max-h-56 overflow-y-auto">
            {searching ? (
              results.length ? (
                <Grid emoji={results} current={current} onPick={choose} />
              ) : (
                <p className="px-1 py-6 text-center font-mono text-xs text-muted">
                  no emoji for “{query.trim()}”
                </p>
              )
            ) : (
              EMOJI_GROUPS.map((group) => (
                <div key={group.name} className="mb-1">
                  <p className="px-1 pt-1 pb-1 font-mono text-[11px] tracking-wide text-muted uppercase">
                    {group.name}
                  </p>
                  <Grid
                    emoji={group.items.map((i) => i.char)}
                    current={current}
                    onPick={choose}
                  />
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function Grid({
  emoji,
  current,
  onPick,
}: {
  emoji: string[]
  current: string | null
  onPick: (emoji: string) => void
}) {
  return (
    <div className="grid grid-cols-8 gap-0.5">
      {emoji.map((e) => (
        <button
          key={e}
          type="button"
          aria-label={`emoji ${e}`}
          aria-pressed={current === e}
          onClick={() => onPick(e)}
          className={cn(
            'flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-lg hover:bg-faint',
            current === e && 'bg-faint ring-[1.5px] ring-ink',
          )}
        >
          {e}
        </button>
      ))}
    </div>
  )
}
