import { createApp } from './app.js'
import { FileStore } from './file-store.js'

const PORT = Number(process.env.PORT ?? 3001)
const DATA_FILE =
  process.env.DATA_FILE ??
  new URL('../data/links.json', import.meta.url).pathname

const app = createApp(new FileStore(DATA_FILE))

app.listen(PORT, () => {
  console.log(`ikli server on http://localhost:${PORT}`)
})
