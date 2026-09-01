import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { api, ApiError, shortUrlFor } from '@/lib/api';
import { rememberKey } from '@/lib/session';
import { Shell, copyText, submitOnEnter } from '@/components/shell';
import { Button } from '@/components/ui/button';

export default function Home() {
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  async function shorten(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const link = await api.create(url.trim());
      rememberKey(link.slug, link.editKey);
      await copyText(shortUrlFor(link.slug));
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
    </Shell>
  );
}
