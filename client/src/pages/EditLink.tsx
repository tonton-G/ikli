import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, ApiError, shortHost, type LinkPublic } from '@/lib/api';
import { forgetKey, moveKey, recallKey, rememberKey } from '@/lib/session';
import { LoadingShell, Shell, submitOnEnter } from '@/components/shell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

export function LostKey() {
  const { slug = '' } = useParams();
  return (
    <Shell>
      <div className="flex flex-1 flex-col items-center justify-center pb-24 text-center">
        <div className="mb-10 h-20 w-20 rounded-full border-[1.5px] border-ink" />
        <h1 className="font-display text-5xl font-semibold">No key, no edits.</h1>
        <p className="mt-6 max-w-sm font-mono text-sm leading-relaxed text-muted">
          The link keeps working forever and its stats stay public at{' '}
          <Link to={`/${slug}+`} className="text-ink underline">
            /{slug}+
          </Link>
          . Losing the key only means the destination is frozen.
        </p>
        <Button variant="outline" asChild className="mt-10">
          <Link to="/">Make a new link</Link>
        </Button>
      </div>
    </Shell>
  );
}

function KeyGate({ slug, onAccepted }: { slug: string; onAccepted: (link: LinkPublic, key: string) => void }) {
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!key.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const link = await api.verify(slug, key.trim());
      rememberKey(slug, key.trim());
      onAccepted(link, key.trim());
    } catch (err) {
      // A typo deserves a retry, not the lost-key dead end.
      const code = err instanceof ApiError ? err.code : 'error';
      if (err instanceof ApiError && err.status === 404) {
        navigate('/', { replace: true });
      } else {
        setError(
          code === 'bad_key'
            ? "that key doesn't fit this link — try again"
            : code === 'rate_limited'
              ? 'too many tries — wait a few minutes'
              : 'could not reach the server — try again',
        );
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Shell>
      <div className="flex flex-1 flex-col justify-center pb-24">
        <h1 className="font-display mb-2 text-5xl font-semibold">Got the key?</h1>
        <p className="mb-8 font-mono text-sm text-muted">
          editing {shortHost()}/{slug} needs its edit key — e.g. tide-9042-plum
        </p>
        <form onSubmit={submit} className="flex max-w-md gap-4">
          <Input
            autoFocus
            value={key}
            onChange={(e) => setKey(e.target.value)}
            onKeyDown={submitOnEnter}
            placeholder="your-0000-key"
            aria-label="Edit key"
            className="rounded-full"
          />
          <Button type="submit" disabled={busy} className="shrink-0">
            Unlock
          </Button>
        </form>
        {error && <p className="mt-6 font-mono text-sm text-danger">{error}</p>}
        <Link to={`/${slug}/lost`} className="mt-6 font-mono text-sm text-muted underline hover:text-ink">
          lost it?
        </Link>
      </div>
    </Shell>
  );
}

export default function EditLink() {
  const { slug = '' } = useParams();
  const navigate = useNavigate();
  const [link, setLink] = useState<LinkPublic | null>(null);
  const [key, setKey] = useState<string | null>(null);
  // Only "checking" while there is actually a remembered key to verify.
  const [checking, setChecking] = useState(() => recallKey(slug) !== null);

  const [url, setUrl] = useState('');
  const [newSlug, setNewSlug] = useState(slug);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function accept(l: LinkPublic, k: string) {
    setLink(l);
    setKey(k);
    setUrl(l.longUrl);
    setNewSlug(l.slug);
  }

  // Try the key remembered from creation/unlock in this session.
  useEffect(() => {
    const remembered = recallKey(slug);
    if (!remembered) return;
    api
      .verify(slug, remembered)
      .then((l) => accept(l, remembered))
      .catch(() => forgetKey(slug))
      .finally(() => setChecking(false));
  }, [slug]);

  async function save() {
    if (!link || !key || busy) return;
    setBusy(true);
    setError(null);
    try {
      const changes: Parameters<typeof api.update>[2] = { url };
      if (newSlug !== link.slug) changes.slug = newSlug.trim().toLowerCase();
      const updated = await api.update(link.slug, key, changes);
      if (updated.slug !== link.slug) moveKey(link.slug, updated.slug);
      navigate(`/${updated.slug}/done`);
    } catch (err) {
      const code = err instanceof ApiError ? err.code : 'error';
      setError(
        code === 'slug_taken'
          ? 'that slug is taken — try another'
          : code === 'invalid_slug'
            ? 'slugs are 3–32 chars: a–z, 0–9, dashes'
            : code === 'invalid_url'
              ? "that destination doesn't look like a link"
              : 'something went wrong — try again',
      );
    } finally {
      setBusy(false);
    }
  }

  async function removeLink() {
    if (!link || !key) return;
    try {
      await api.remove(link.slug, key);
      forgetKey(link.slug);
      navigate('/');
    } catch {
      setError('delete failed — try again');
    }
  }

  if (checking) return <LoadingShell />;
  if (!link || !key) return <KeyGate slug={slug} onAccepted={accept} />;

  return (
    <Shell right={<span>key accepted ✓</span>}>
      <h1 className="font-display mb-8 text-5xl font-semibold">Edit this link</h1>

      <Label className="mb-2" htmlFor="dest">
        destination
      </Label>
      <Input id="dest" value={url} onChange={(e) => setUrl(e.target.value)} className="mb-7" />

      <Label className="mb-2" htmlFor="slug">
        slug
      </Label>
      <div className="mb-7 flex items-center gap-3">
        <span className="font-mono text-sm text-muted">{shortHost(link.shortUrl)}/</span>
        <Input
          id="slug"
          value={newSlug}
          onChange={(e) => setNewSlug(e.target.value)}
          className="font-display text-xl"
        />
      </div>

      {error && <p className="mb-6 font-mono text-sm text-danger">{error}</p>}

      <div className="mt-auto flex items-center justify-between pt-8">
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <button
              type="button"
              className="cursor-pointer font-mono text-sm text-muted underline-offset-4 hover:text-danger hover:underline"
            >
              delete link
            </button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete this link?</AlertDialogTitle>
              <AlertDialogDescription>
                {shortHost(link.shortUrl)}/{link.slug} will stop working immediately, and its stats go
                with it. There's no undo — this is the one thing the key can't bring back.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Keep it</AlertDialogCancel>
              <AlertDialogAction variant="destructive" onClick={removeLink}>
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        <Button size="lg" onClick={save} disabled={busy}>
          Save changes
        </Button>
      </div>
    </Shell>
  );
}
