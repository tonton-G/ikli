import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, shortHost, type LinkStats } from '@/lib/api';
import { LoadingShell, Shell } from '@/components/shell';
import { Button } from '@/components/ui/button';

const DAYS_SHOWN = 10;

function lastDays(n: number): string[] {
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    out.push(new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10));
  }
  return out;
}

function age(createdAt: string): string {
  const days = Math.floor((Date.now() - Date.parse(createdAt)) / 86_400_000);
  if (days < 1) return 'new';
  if (days < 365) return `${days}d`;
  return `${Math.floor(days / 365)}y`;
}

export default function Stats({ slug }: { slug: string }) {
  const [stats, setStats] = useState<LinkStats | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    api.stats(slug).then(setStats).catch(() => navigate('/', { replace: true }));
  }, [slug, navigate]);

  if (!stats) return <LoadingShell />;

  const days = lastDays(DAYS_SHOWN);
  const perDay = days.map((d) => stats.clicksByDay[d] ?? 0);
  const max = Math.max(...perDay, 1);

  const referrers = Object.entries(stats.referrers)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 4);
  const maxRef = Math.max(...referrers.map(([, n]) => n), 1);

  return (
    <Shell right={<span>public · no login</span>}>
      <h1 className="font-display text-5xl font-semibold">
        {shortHost()}/{slug}
      </h1>

      <div className="mt-8 flex gap-12 border-y border-ink/10 py-7">
        {(
          [
            [stats.clicks.toLocaleString(), 'clicks'],
            [stats.uniques.toLocaleString(), 'unique'],
            [age(stats.createdAt), 'old'],
          ] as const
        ).map(([value, label]) => (
          <div key={label}>
            <div className="font-display text-5xl leading-none font-semibold">{value}</div>
            <div className="mt-2 font-mono text-sm text-muted">{label}</div>
          </div>
        ))}
      </div>

      <div
        className="mt-10 flex h-40 items-end gap-3"
        role="img"
        aria-label={`Clicks per day over the last ${DAYS_SHOWN} days`}
      >
        {perDay.map((n, i) => (
          <div
            key={days[i]}
            title={`${days[i]}: ${n}`}
            className="flex-1 rounded-t-sm bg-ink"
            style={{ height: `${Math.max((n / max) * 100, 3)}%`, opacity: n === 0 ? 0.12 : 1 }}
          />
        ))}
      </div>

      <div className="mt-10">
        <p className="mb-4 font-mono text-sm text-muted">referrers</p>
        {referrers.length === 0 ? (
          <p className="font-mono text-sm text-muted/70">no clicks yet</p>
        ) : (
          <div className="flex flex-col gap-3">
            {referrers.map(([host, n]) => (
              <div key={host || 'direct'} className="flex items-center gap-4">
                <span className="w-32 shrink-0 truncate font-mono text-xs text-muted">
                  {host || 'direct'}
                </span>
                <div
                  className="h-2.5 rounded-full bg-ink/55"
                  style={{ width: `${(n / maxRef) * 70}%`, minWidth: '0.75rem' }}
                />
                <span className="font-mono text-xs text-muted">{n}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mt-auto flex items-center justify-between pt-14">
        <Link to={`/${slug}/edit`} className="font-mono text-sm text-muted underline-offset-4 hover:text-ink hover:underline">
          have the key? edit this link
        </Link>
        <Button variant="outline" asChild>
          <Link to="/">Shorten your own</Link>
        </Button>
      </div>
    </Shell>
  );
}
