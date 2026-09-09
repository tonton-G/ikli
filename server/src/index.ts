import { createApp } from './app.js'
import { DynamoDbStore } from './dynamo-store.js'
import { FileStore } from './file-store.js'
import type { LinkStore } from './types.js'

const PORT = Number(process.env.PORT ?? 3001)
const LINKS_TABLE = process.env.LINKS_TABLE


// important on asg
// links, and scale-in destroys whatever the terminated instance was holding.
// Fail to boot rather than let that configuration reach production.
if (!LINKS_TABLE && process.env.NODE_ENV === 'production') {
  console.error(
    'LINKS_TABLE is not set. Refusing to start on the file store in production.',
  )
  process.exit(1)
}

let store: LinkStore
if (LINKS_TABLE) {
  store = new DynamoDbStore(LINKS_TABLE)
  console.log(`ikli store: DynamoDB table "${LINKS_TABLE}"`)
} else {
  const dataFile =
    process.env.DATA_FILE ?? new URL('../data/links.json', import.meta.url).pathname
  store = new FileStore(dataFile)
  console.log(`ikli store: local file ${dataFile} (development only)`)
}

const app = createApp(store)

app.listen(PORT, () => {
  console.log(`ikli server on http://localhost:${PORT}`)
})
