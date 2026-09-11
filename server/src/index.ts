import { fileURLToPath } from 'node:url'
import { createApp } from './app.js'
import { DynamoDbStore } from './dynamo-store.js'
import { FileStore } from './file-store.js'
import type { LinkStore } from './types.js'

const PORT = Number(process.env.PORT ?? 3001)
const DYNAMODB_TABLE = process.env.DYNAMODB_TABLE
const BASE_URL = process.env.BASE_URL
// "" and unset are indistinguishable in most CI/CD templating; treat both as not-provided.
const TRUST_PROXY_HOPS_ENV = process.env.TRUST_PROXY_HOPS || undefined
const TRUST_PROXY_HOPS = Number(TRUST_PROXY_HOPS_ENV ?? 0)


// important on asg
// links, and scale-in destroys whatever the terminated instance was holding.
// Fail to boot rather than let that configuration reach production.
if (!DYNAMODB_TABLE && process.env.NODE_ENV === 'production') {
  console.error(
    'DYNAMODB_TABLE is not set. Refusing to start on the file store in production.',
  )
  process.exit(1)
}

let store: LinkStore
if (DYNAMODB_TABLE) {
  store = new DynamoDbStore(DYNAMODB_TABLE)
  console.log(`ikli store: DynamoDB table "${DYNAMODB_TABLE}"`)
} else {
  // fileURLToPath, not .pathname: a URL keeps its percent-encoding, so a repo
  // living under a path with a space in it resolves to a literal "%20" and dev
  // links get written to a directory that only looks like the project.
  const dataFile =
    process.env.DATA_FILE ?? fileURLToPath(new URL('../data/links.json', import.meta.url))
  store = new FileStore(dataFile)
  console.log(`ikli store: local file ${dataFile} (development only)`)
}

// Short URLs and the QR codes made from them are minted from this, never from
// the request host. Unset in production would mean codes encoding whatever
// hostname the instance happened to be reached on, printed and unfixable.
if (!BASE_URL && process.env.NODE_ENV === 'production') {
  console.error(
    'BASE_URL is not set. Refusing to start: short URLs would encode the request host.',
  )
  process.exit(1)
}
const baseUrl = (BASE_URL ?? `http://localhost:${PORT}`).replace(/\/+$/, '')
console.log(`ikli base URL: ${baseUrl}`)

// req.ip is derived from this, and req.ip is what visitor stats and every
// per-IP limit key on. Number('two') is NaN and Number('') is 0, both of which
// Express accepts in silence, so the shape is checked here rather than found
// later in a stats table claiming every visitor is the same person.
if (!Number.isInteger(TRUST_PROXY_HOPS) || TRUST_PROXY_HOPS < 0) {
  console.error(
    `TRUST_PROXY_HOPS must be a non-negative integer, got "${process.env.TRUST_PROXY_HOPS}".`,
  )
  process.exit(1)
}

// In production there is always at least the ALB in front, so leaving this
// unset is not a safe default: 0 hops makes req.ip the load balancer's own
// address on every request, folding all visitors into one bucket and letting
// the redirect limiter throttle the whole fleet through a handful of IPs.
if (TRUST_PROXY_HOPS_ENV === undefined && process.env.NODE_ENV === 'production') {
  console.error(
    'TRUST_PROXY_HOPS is not set. Refusing to start: req.ip would be the load balancer, not the visitor.',
  )
  process.exit(1)
}
console.log(`ikli trusted proxy hops: ${TRUST_PROXY_HOPS}`)

const app = createApp(store, baseUrl, { trustProxyHops: TRUST_PROXY_HOPS })

const server = app.listen(PORT, () => {
  console.log(`ikli server on http://localhost:${PORT}`)
})

// Scale-in and every deploy send SIGTERM, and Node's default is to exit at
// once — dropping whatever is in flight, which on the redirect path means a
// visitor gets a dead connection instead of their 302. The target group's
// deregistration delay exists to cover exactly this window, so stop accepting
// new connections and let the open ones finish.
function shutdown(signal: string): void {
  console.log(`${signal} received, draining`)
  server.close((err) => {
    if (err) console.error('error while closing:', err)
    console.log('ikli server closed')
    process.exit(err ? 1 : 0)
  })
  // Keep-alive sockets sitting idle would otherwise hold close() open for as
  // long as the client cares to wait. In-flight requests are untouched.
  server.closeIdleConnections()
  // And a request that never finishes must not outlive the drain: the ASG
  // sends SIGKILL on its own timer, so exit first and on our own terms.
  setTimeout(() => {
    console.error('drain timed out with connections still open, exiting anyway')
    process.exit(1)
  }, 10_000).unref()
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))
