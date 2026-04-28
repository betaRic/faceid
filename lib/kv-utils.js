// lib/kv-utils.js
import { createClient } from 'redis'

let client = null
let connecting = null
let disabledUntil = 0

const KV_CONNECT_TIMEOUT_MS = 1200
const KV_RETRY_BACKOFF_MS = 60_000

function getKeyPrefix() {
  return String(process.env.CACHE_KEY_PREFIX || process.env.KV_KEY_PREFIX || '')
    .trim()
    .replace(/[^a-zA-Z0-9:_.-]/g, '-')
    .replace(/^:+|:+$/g, '')
    .slice(0, 80)
}

function withKeyPrefix(key) {
  const rawKey = String(key || '')
  const prefix = getKeyPrefix()
  return prefix ? `${prefix}:${rawKey}` : rawKey
}

export { getClient as getKvClient }

async function getClient() {
  if (client && client.isOpen) return client
  if (connecting) return connecting

  if (Date.now() < disabledUntil) return null

  const url = process.env.REDIS_URL?.trim()
  if (!url) {
    return null
  }

  connecting = (async () => {
    let redis = null
    try {
      redis = createClient({
        url,
        socket: {
          connectTimeout: KV_CONNECT_TIMEOUT_MS,
          reconnectStrategy: false,
        },
      })
      redis.on('error', () => {})
      await Promise.race([
        redis.connect(),
        new Promise((_, reject) => {
          setTimeout(() => reject(new Error('KV connect timeout')), KV_CONNECT_TIMEOUT_MS)
        }),
      ])
      client = redis
      return client
    } catch (err) {
      disabledUntil = Date.now() + KV_RETRY_BACKOFF_MS
      if (redis) {
        try {
          redis.destroy?.()
        } catch {}
      }
      if (process.env.NODE_ENV !== 'production') {
        console.warn('[KV] Redis unavailable, using in-memory fallback:', err?.message || err)
      }
      return null
    } finally {
      connecting = null
    }
  })()

  return connecting
}

export async function kvGet(key) {
  const redis = await getClient()
  if (!redis) return null
  try {
    const value = await redis.get(withKeyPrefix(key))
    return value ? JSON.parse(value) : null
  } catch {
    return null
  }
}

export async function kvSet(key, value, options = {}) {
  const redis = await getClient()
  if (!redis) return false
  try {
    const serialized = JSON.stringify(value)
    if (options.ex) {
      await redis.setEx(withKeyPrefix(key), options.ex, serialized)
    } else {
      await redis.set(withKeyPrefix(key), serialized)
    }
    return true
  } catch {
    return false
  }
}

export async function kvMget(...keys) {
  const redis = await getClient()
  if (!redis) return keys.map(() => null)
  try {
    const values = await redis.mGet(keys.map(withKeyPrefix))
    return values.map(v => (v ? JSON.parse(v) : null))
  } catch {
    return keys.map(() => null)
  }
}

export async function kvKeys(pattern) {
  const redis = await getClient()
  if (!redis) return []
  try {
    return await redis.keys(withKeyPrefix(pattern))
  } catch {
    return []
  }
}

export async function kvDel(key) {
  const redis = await getClient()
  if (!redis) return false
  try {
    await redis.del(withKeyPrefix(key))
    return true
  } catch {
    return false
  }
}

export async function kvIncr(key) {
  const redis = await getClient()
  if (!redis) return null
  try {
    const newValue = await redis.incr(withKeyPrefix(key))
    return newValue
  } catch {
    return null
  }
}

export async function kvIncrWithExpire(key, seconds) {
  const redis = await getClient()
  if (!redis) return null
  try {
    const redisKey = withKeyPrefix(key)
    const result = await redis.multi()
      .incr(redisKey)
      .expire(redisKey, seconds)
      .exec()
    const firstReply = Array.isArray(result) ? result[0] : result
    const count = Number(Array.isArray(firstReply) ? firstReply[firstReply.length - 1] : firstReply)
    return Number.isFinite(count) ? count : null
  } catch {
    return null
  }
}

export async function kvExpire(key, seconds) {
  const redis = await getClient()
  if (!redis) return false
  try {
    const result = await redis.expire(withKeyPrefix(key), seconds)
    return result === 1
  } catch {
    return false
  }
}

export async function kvAvailable() {
  const redis = await getClient()
  if (!redis) return false
  try {
    await redis.ping()
    return true
  } catch {
    return false
  }
}
