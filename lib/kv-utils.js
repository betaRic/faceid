// lib/kv-utils.js
import { createClient } from 'redis'

let client = null
let connecting = null

async function getClient() {
  if (client && client.isOpen) return client
  if (connecting) return connecting

  const url = process.env.REDIS_URL?.trim()
  if (!url) {
    console.warn('[KV] REDIS_URL not set, caching disabled')
    return null
  }

  connecting = (async () => {
    try {
      const redis = createClient({ url })
      redis.on('error', (err) => console.error('[KV] Redis error:', err))
      await redis.connect()
      client = redis
      return client
    } catch (err) {
      console.error('[KV] Failed to connect to Redis:', err)
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