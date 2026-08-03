import { createServer } from 'node:http'
import { parse } from 'node:url'
import next from 'next'

const app = next({ dev: false })
const handle = app.getRequestHandler()

await app.prepare()

createServer((request, response) => {
  handle(request, response, parse(request.url, true))
}).listen(Number(process.env.PORT), () => {
  console.log(`FaceAttend is listening on port ${process.env.PORT}`)
})
