// lib/kv-utils.js
import { createClient } from 'redis'

let client = null
let connecting = null
let disabledUntil = 0

const KV_CONNECT_TIMEOUT_MS = 1200
const KV_RETRY_BACKOFF_MS = 60_000

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
    const value = await redis.get(key)
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
      await redis.setEx(key, options.ex, serialized)
    } else {
      await redis.set(key, serialized)
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
    const values = await redis.mGet(keys)
    return values.map(v => (v ? JSON.parse(v) : null))
  } catch {
    return keys.map(() => null)
  }
}

export async function kvKeys(pattern) {
  const redis = await getClient()
  if (!redis) return []
  try {
    return await redis.keys(pattern)
  } catch {
    return []
  }
}

export async function kvDel(key) {
  const redis = await getClient()
  if (!redis) return false
  try {
    await redis.del(key)
    return true
  } catch {
    return false
  }
}

export async function kvIncr(key) {
  const redis = await getClient()
  if (!redis) return null
  try {
    const newValue = await redis.incr(key)
    return newValue
  } catch {
    return null
  }
}

export async function kvExpire(key, seconds) {
  const redis = await getClient()
  if (!redis) return false
  try {
    const result = await redis.expire(key, seconds)
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
