import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { Check, Copy } from 'lucide-react'
import {
  api,
  shortHost,
  type LinkPublic,
} from '@/lib/api'
import { recallKey } from '@/lib/session'
import { renderQrSvg, downloadPng } from '@/lib/qr'
import { Shell, copyText } from '@/components/shell'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

// history.state can outlive a deploy and carry a stale, incomplete object.
function isLinkPublic(v: unknown): v is LinkPublic {
  return (
    typeof v === 'object' &&
    v !== null &&
    typeof (v as LinkPublic).slug === 'string' &&
    typeof (v as LinkPublic).shortUrl === 'string'
  )
}

export default function Result() {
  const { slug = '' } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const [link, setLink] = useState<LinkPublic | null>(
    isLinkPublic(location.state) ? location.state : null,
  )
  const [copied, setCopied] = useState(false)
  const [keySaved, setKeySaved] = useState(false)
  const editKey = recallKey(slug)

  // Direct visit / refresh: re-fetch public metadata for the QR style.
  useEffect(() => {
    if (link) return
    api
      .get(slug)
      .then(setLink)
      .catch(() => navigate('/', { replace: true }))
  }, [link, slug, navigate])

  // The server's short URL, not one composed from this page's location.
  const shortUrl = link?.shortUrl ?? ''
  const qrSvg = useMemo(
    () => (link ? renderQrSvg(link.shortUrl, link.qrStyle) : ''),
    [link],
  )

  function flash() {
    setCopied(true)
    setTimeout(() => setCopied(false), 1600)
  }

  if (!link) return <Shell right={null}>{null}</Shell>

  return (
    <Shell
      right={
        <Link to="/" className="hover:text-ink">
          ↵ new link
        </Link>
      }
    >
      <div className="flex flex-col items-center">
        <p className="font-mono text-sm text-muted">shortened &amp; copied</p>

        <a
          href={shortUrl}
          target="_blank"
          rel="noreferrer"
          className="font-display mt-3 border-b-4 border-ink pb-1 text-6xl font-semibold sm:text-7xl"
        >
          {shortHost(shortUrl)}/{slug}
        </a>

        <div className="mt-9 flex flex-wrap justify-center gap-4">
          <Button
            variant="outline"
            onClick={() => copyText(shortUrl).then(flash)}
          >
            {copied ? 'Copied ✓' : 'Copy'}
          </Button>
          <Button variant="outline" onClick={() => navigate(`/${slug}/edit`)}>
            Edit slug
          </Button>
          <Button variant="outline" onClick={() => navigate(`/${slug}+`)}>
            Stats
          </Button>
        </div>

        <div className="mt-12 flex flex-wrap items-center justify-center gap-8">
          <div
            aria-label="QR code preview"
            className="h-40 w-40 rounded-2xl border-[1.5px] border-ink p-3 [&>svg]:h-full [&>svg]:w-full"
            dangerouslySetInnerHTML={{ __html: qrSvg }}
          />
          <div className="flex flex-col gap-4">
            <Button variant="outline" onClick={() => navigate(`/${slug}/qr`)}>
              Customize QR →
            </Button>
            <Button
              variant="outline"
              onClick={() => downloadPng(qrSvg, `ikli-${slug}.png`)}
            >
              Download
            </Button>
          </div>
        </div>

        {editKey && (
          <div className="mt-14 w-full max-w-xl rounded-3xl border-[1.5px] border-dashed border-muted p-7">
            <p className="mb-4 font-mono text-sm text-muted">
              edit key — the only way back in
            </p>
            <div className="flex items-center gap-4">
              <Input
                readOnly
                value={editKey}
                aria-label="Edit key"
                onFocus={(e) => e.target.select()}
              />
              <Button
                className="shrink-0"
                onClick={() => copyText(editKey).then(() => setKeySaved(true))}
              >
                {keySaved ? (
                  <Check className="size-5" strokeWidth={2.2} />
                ) : (
                  <Copy className="size-5" strokeWidth={2.2} />
                )}
                {keySaved ? 'Saved' : 'Save'}
              </Button>
            </div>
            <p className="mt-4 font-mono text-xs text-muted">
              coming back later? paste {shortHost(shortUrl)}/{slug} on the home page and
              it'll ask for this key.
            </p>
          </div>
        )}
      </div>
    </Shell>
  )
}
