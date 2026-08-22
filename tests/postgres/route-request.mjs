import { NextRequest } from 'next/server.js'

const TEST_ORIGIN = 'http://127.0.0.1:3000'

function isPlainObject(value) {
  if (!value || typeof value !== 'object') return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

export function sameOriginRequest(path, { body, cookie, headers, ...init } = {}) {
  const url = new URL(path, TEST_ORIGIN)
  if (url.origin !== TEST_ORIGIN) {
    throw new Error('Route test requests must use the local test origin')
  }

  const requestHeaders = new Headers(headers)
  if (!requestHeaders.has('origin')) requestHeaders.set('origin', TEST_ORIGIN)
  if (cookie) requestHeaders.set('cookie', cookie)

  let requestBody = body
  if (isPlainObject(body)) {
    requestBody = JSON.stringify(body)
    if (!requestHeaders.has('content-type')) {
      requestHeaders.set('content-type', 'application/json')
    }
  }

  return new NextRequest(url, {
    ...init,
    body: requestBody,
    headers: requestHeaders,
  })
}
