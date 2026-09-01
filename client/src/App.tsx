import { BrowserRouter, Link, Route, Routes, useLocation } from 'react-router-dom';
import Home from './pages/Home';
import Result from './pages/Result';
import QrCustomize from './pages/QrCustomize';
import EditLink, { LostKey } from './pages/EditLink';
import Stats from './pages/Stats';
import { shortUrlFor } from '@/lib/api';
import { Shell } from '@/components/shell';
import { Button } from '@/components/ui/button';

function NotFound() {
  return (
    <Shell>
      <div className="flex flex-1 flex-col items-center justify-center pb-24 text-center">
        <h1 className="font-display text-5xl font-semibold">Nothing here.</h1>
        <p className="mt-5 font-mono text-sm text-muted">that page doesn't exist</p>
        <Button variant="outline" asChild className="mt-10">
          <Link to="/">Make a new link</Link>
        </Button>
      </div>
    </Shell>
  );
}

/**
 * Routes React Router can't express directly:
 *  - "/kf3a+"  → public stats page
 *  - "/kf3a"   → hand off to the redirect server
 */
function CatchAll() {
  const { pathname } = useLocation();

  const statsMatch = pathname.match(/^\/([a-z0-9-]{3,32})\+$/);
  if (statsMatch) return <Stats slug={statsMatch[1]} />;

  const slugMatch = pathname.match(/^\/([a-z0-9-]{3,32})$/);
  if (slugMatch) {
    window.location.replace(shortUrlFor(slugMatch[1]));
    return null;
  }

  return <NotFound />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/:slug/done" element={<Result />} />
        <Route path="/:slug/qr" element={<QrCustomize />} />
        <Route path="/:slug/edit" element={<EditLink />} />
        <Route path="/:slug/lost" element={<LostKey />} />
        <Route path="*" element={<CatchAll />} />
      </Routes>
    </BrowserRouter>
  );
}
