import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, ApiError, SHORT_BASE_DISPLAY, type LinkPublic } from '@/lib/api';
import { forgetKey, moveKey, recallKey, rememberKey } from '@/lib/session';
import { Shell, submitOnEnter } from '@/components/shell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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

const EXPIRY_CHOICES = [
  { value: 'never', label: 'never' },
  { value: '1', label: '1 day' },
  { value: '7', label: '7 days' },
  { value: '30', label: '30 days' },
  { value: '90', label: '90 days' },
];

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
  const navigate = useNavigate();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!key.trim() || busy) return;
    setBusy(true);
    try {
      const link = await api.verify(slug, key.trim());
      rememberKey(slug, key.trim());
      onAccepted(link, key.trim());
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) navigate('/', { replace: true });
      else navigate(`/${slug}/lost`, { replace: true });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Shell>
      <div className="flex flex-1 flex-col justify-center pb-24">
        <h1 className="font-display mb-2 text-5xl font-semibold">Got the key?</h1>
        <p className="mb-8 font-mono text-sm text-muted">
          editing {SHORT_BASE_DISPLAY}/{slug} needs its edit key — e.g. tide-9042-plum
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
  const [checking, setChecking] = useState(true);

  const [url, setUrl] = useState('');
  const [newSlug, setNewSlug] = useState(slug);
  const [expiry, setExpiry] = useState('keep'); // 'keep' | 'never' | days as string
  const [password, setPassword] = useState('');
  const [hasPassword, setHasPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function accept(l: LinkPublic, k: string) {
    setLink(l);
    setKey(k);
    setUrl(l.longUrl);
    setNewSlug(l.slug);
    setHasPassword(l.hasPassword);
    setExpiry(l.expiresAt ? 'keep' : 'never');
  }

  // Try the key remembered from creation/unlock in this session.
  useEffect(() => {
    const remembered = recallKey(slug);
    if (!remembered) {
      setChecking(false);
      return;
    }
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
      if (expiry === 'never' && link.expiresAt) changes.expiresAt = null;
      if (expiry !== 'keep' && expiry !== 'never') {
        changes.expiresAt = new Date(Date.now() + Number(expiry) * 86_400_000).toISOString();
      }
      if (password) changes.password = password;
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
    await api.remove(link.slug, key);
    forgetKey(link.slug);
    navigate('/');
  }

  if (checking) return <Shell right={null}>{null}</Shell>;
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
        <span className="font-mono text-sm text-muted">{SHORT_BASE_DISPLAY}/</span>
        <Input
          id="slug"
          value={newSlug}
          onChange={(e) => setNewSlug(e.target.value)}
          className="font-display text-xl"
        />
      </div>

      <div className="mb-10 grid gap-5 sm:grid-cols-2">
        <div className="flex items-center justify-between gap-3 rounded-2xl border-[1.5px] border-dashed border-muted px-5 py-3.5">
          <Label htmlFor="expires">expires</Label>
          <Select value={expiry} onValueChange={setExpiry}>
            <SelectTrigger id="expires" aria-label="Expires">
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="end">
              {link.expiresAt && (
                <SelectItem value="keep">{new Date(link.expiresAt).toLocaleDateString()}</SelectItem>
              )}
              {EXPIRY_CHOICES.map((c) => (
                <SelectItem key={c.value} value={c.value}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center justify-between gap-3 rounded-2xl border-[1.5px] border-dashed border-muted px-5 py-3.5">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="password"
            aria-label="Password"
            className="w-full bg-paper font-mono text-sm outline-none placeholder:text-muted"
          />
          <span className="shrink-0 font-mono text-sm text-muted">
            {password ? 'set on save' : hasPassword ? 'on' : 'off'}
          </span>
        </div>
      </div>

      {hasPassword && (
        <button
          type="button"
          onClick={async () => {
            await api.update(link.slug, key, { password: null });
            setHasPassword(false);
            setPassword('');
          }}
          className="-mt-6 mb-8 cursor-pointer self-start font-mono text-xs text-muted underline hover:text-ink"
        >
          remove password
        </button>
      )}

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
                {SHORT_BASE_DISPLAY}/{link.slug} will stop working immediately, and its stats go
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
