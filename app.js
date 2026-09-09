import { createServer } from 'node:http'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, parse } from 'node:url'

const root = path.dirname(fileURLToPath(import.meta.url))
if (!existsSync(path.join(root, '.env'))) throw new Error('Live .env is required in the site root.')
for (const file of ['.env.local', '.env.production', '.env.production.local']) {
  if (existsSync(path.join(root, file))) {
    throw new Error(`Competing production settings file: ${file}. Keep production settings in .env only.`)
  }
}
// Set this before importing Next so development settings cannot be selected.
// Preserve host-provided variables, including the assigned PORT.
process.env.NODE_ENV = 'production'
process.chdir(root)
const { default: next } = await import('next')
const app = next({ dev: false, dir: root })
const handle = app.getRequestHandler()

await app.prepare()

createServer((request, response) => {
  handle(request, response, parse(request.url, true))
}).listen(Number(process.env.PORT), () => {
  console.log(`FaceAttend is listening on port ${process.env.PORT}`)
})
