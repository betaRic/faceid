import 'server-only'

/**
 * Rate limiting using Redis (via REDIS_URL or Vercel KV).
 * No Firestore reads/writes — fast, cheap, and scales.
 */

const TRUSTED_PROXIES = (process.env.TRUSTED_PROXY_IPS || '').split(',').map(ip => ip.trim()).filter(Boolean)

function isValidIp(ip) {
  if (!ip) return false
  const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/
  const ipv6Regex = /^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$|^::1$|^::$/
  return ipv4Regex.test(ip) || ipv6Regex.test(ip)
}

let redisClient = null

async function getRedisClient() {
  if (redisClient) return redisClient

  const redisUrl = process.env.REDIS_URL
  const kvUrl = process.env.KV_REST_API_URL
  const kvToken = process.env.KV_REST_API_TOKEN

  if (redisUrl) {
    const { Redis } = await import('@upstash/redis')
    redisClient = new Redis({ url: redisUrl, token: 'dummy' })
    return redisClient
  }

  if (kvUrl && kvToken) {
    const { Redis } = await import('@upstash/redis')
    redisClient = new Redis({ url: kvUrl, token: kvToken })
    return redisClient
  }

  return null
}

async function tryKvRateLimit(normalizedKey, limit, windowMs) {
  const kvKey = `rl:${normalizedKey}`
  const windowSeconds = Math.ceil(windowMs / 1000)

  try {
    const redis = await getRedisClient()
    if (!redis) {
      throw new Error('No Redis client available')
    }

    const count = await redis.incr(kvKey)
    if (count === 1) await redis.expire(kvKey, windowSeconds)
    return { ok: count <= limit, remaining: Math.max(0, limit - count) }
  } catch (err) {
    console.error('Rate limiting unavailable, allowing request:', err.message)
    return { ok: true, remaining: limit }
  }
}

function normalizeToken(value) {
  const token = String(value || '').trim().toLowerCase()
  return token.replace(/[^a-z0-9:_.-]/g, '-').slice(0, 180)
}

export function getRequestIp(request) {
  const forwarded = request.headers.get('x-forwarded-for')
  const realIp = request.headers.get('x-real-ip')
  const socketIp = request.socket?.remoteAddress || ''
  
  if (forwarded) {
    const ips = forwarded.split(',').map(ip => ip.trim())
    
    if (TRUSTED_PROXIES.length > 0) {
      const firstIp = ips[0]
      if (TRUSTED_PROXIES.includes(firstIp) || isValidIp(firstIp)) {
        return firstIp
      }
      const lastValidIp = ips.find(ip => isValidIp(ip))
      if (lastValidIp) return lastValidIp
    }
    
    return ips[0].trim()
  }
  
  if (realIp && isValidIp(realIp)) return realIp
  if (socketIp && isValidIp(socketIp)) return socketIp
  
  return 'unknown'
}

export async function enforceRateLimit(db, { key, limit, windowMs }) {
  const normalizedKey = normalizeToken(key)
  if (!normalizedKey) return { ok: true, remaining: limit }
  return tryKvRateLimit(normalizedKey, limit, windowMs)
}

