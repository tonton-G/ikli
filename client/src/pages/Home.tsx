import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { api, ApiError, shortHost } from '@/lib/api';
import { rememberKey } from '@/lib/session';
import { Shell, copyText, submitOnEnter } from '@/components/shell';
import { Button } from '@/components/ui/button';

/** Edit keys look like `tide-9042-plum` — never a slug, however slug-shaped. */
const EDIT_KEY = /^[a-z]+-\d{4}-[a-z]+$/;

/**
 * One of our own short links (or a bare slug) pasted back in is an edit
 * request, not a shorten — that's what people who saved a key actually have.
 */
function editSlugFrom(raw: string): string | null {
  const input = raw.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/+$/, '');
  const isSlug = (s: string) => /^[a-z0-9-]{3,32}$/.test(s) && !EDIT_KEY.test(s);
  if (isSlug(input)) return input;
  const [host, ...rest] = input.split('/');
  // In production the SPA and short links share one origin, so this page's own
  // host is the canonical short host; localhost:3001 covers the split dev setup.
  const hosts = [window.location.host, 'localhost:3001'];
  const path = rest.join('/');
  return hosts.includes(host) && isSlug(path) ? path : null;
}

export default function Home() {
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);

  async function shorten(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim() || busy) return;
    if (EDIT_KEY.test(url.trim().toLowerCase())) {
      setError("that's an edit key — paste the link it belongs to");
      return;
    }
    const editSlug = editSlugFrom(url);
    if (editSlug) {
      navigate(`/${editSlug}/edit`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const link = await api.create(url.trim());
      rememberKey(link.slug, link.editKey);
      await copyText(link.shortUrl);
      navigate(`/${link.slug}/done`, { state: link });
    } catch (err) {
      setError(
        err instanceof ApiError && err.code === 'invalid_url'
          ? "that doesn't look like a link — try a full URL"
          : 'could not reach the server — try again',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Shell>
      <div className="flex flex-1 flex-col justify-center pb-24">
        <h1 className="font-display mb-8 text-6xl font-semibold sm:text-7xl">
          Paste a long link.
        </h1>

        <form onSubmit={shorten} className="relative">
          <input
            ref={inputRef}
            autoFocus
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={submitOnEnter}
            placeholder="https://somewhere.long/and/winding?path=true"
            aria-label="Long link"
            className="w-full rounded-full border-[1.5px] border-ink bg-paper py-6 pr-24 pl-8 font-mono text-sm outline-none placeholder:text-muted focus:ring-2 focus:ring-ink/15"
          />
          <Button
            type="submit"
            size="icon"
            aria-label="Shorten"
            disabled={busy}
            className="absolute top-1/2 right-2.5 -translate-y-1/2"
          >
            <ArrowRight className="size-5.5" strokeWidth={2.2} />
          </Button>
        </form>

        <p className="mt-5 font-mono text-sm text-muted">
          {error ? (
            <span className="text-danger">{error}</span>
          ) : (
            <>no account · nothing to sign up for · ↵ to shorten</>
          )}
        </p>
      </div>

      <div className="mt-auto pt-14">
        <button
          type="button"
          onClick={() => inputRef.current?.focus()}
          className="cursor-pointer font-mono text-sm text-muted underline-offset-4 hover:text-ink hover:underline"
        >
          have a key? paste your {shortHost()} link above
        </button>
      </div>
    </Shell>
  );
}
