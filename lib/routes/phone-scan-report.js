import 'server-only'
import { createOriginGuard } from '@/lib/csrf'
import { enforceRateLimit, getRequestIp } from '@/lib/rate-limit'
import { sanitizePhoneScanReport } from '@/lib/scan-report-policy'
import { savePhoneScanReport } from '@/lib/postgres/phone-scan-reports'

async function readSmallJson(request) {
  if (!request.body) return null
  const reader = request.body.getReader()
  const chunks = []
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > 2048) { await reader.cancel(); return 'oversized' }
      chunks.push(value)
    }
    const bytes = new Uint8Array(size)
    let offset = 0
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
    return JSON.parse(new TextDecoder().decode(bytes))
  } catch { return null }
  finally { reader.releaseLock() }
}

export function createPhoneScanPost({ guard = createOriginGuard(),
  rate = options => enforceRateLimit(null, options), save = savePhoneScanReport } = {}) {
  return async request => {
    try {
      const denied = await guard(request)
      if (denied) return denied
      if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) return new Response(null, { status: 415 })
      const limited = await rate({ key: `phone-scan:${getRequestIp(request)}`, limit: 120, windowMs: 60000 })
      if (!limited.ok) return new Response(null, { status: 429 })
      const globalLimit = await rate({ key: 'phone-scan:global', limit: 10000, windowMs: 86400000 })
      if (!globalLimit.ok) return new Response(null, { status: 429 })
      const body = await readSmallJson(request)
      if (body === 'oversized') return new Response(null, { status: 413 })
      const safe = sanitizePhoneScanReport(body)
      if (!safe) return new Response(null, { status: 400 })
      await save(safe)
      return new Response(null, { status: 202 })
    } catch {
      return new Response(null, { status: 503 })
    }
  }
}
