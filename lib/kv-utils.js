/**
 * lib/kv-utils.js
 * Centralized KV access with timeout and availability guard.
 * Replaces scattered `import { kv } from '@vercel/kv'` throughout the codebase.
 *
 * If KV is not configured (local dev without Vercel KV env vars),
 * all operations are no-ops that resolve immediately instead of hanging.
 */

const KV_TIMEOUT_MS = 2000
const KV_AVAILABLE =
  Boolean(process.env.KV_REST_API_URL?.trim()) &&
  Boolean(process.env.KV_REST_API_TOKEN?.trim())

function withTimeout(promise, ms = KV_TIMEOUT_MS) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`KV timeout after ${ms}ms`)), ms),
    ),
  ])
}

async function getKv() {
  if (!KV_AVAILABLE) return null
  try {
    const { kv } = await import('@vercel/kv')
    return kv
  } catch {
    return null
  }
}

export async function kvGet(key) {
  const kv = await getKv()
  if (!kv) return null
  try {
    return await withTimeout(kv.get(key))
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(`[KV] get(${key}) failed:`, err.message)
    }
    return null
  }
}

export async function kvSet(key, value, options = {}) {
  const kv = await getKv()
  if (!kv) return false
  try {
    await withTimeout(kv.set(key, value, options))
    return true
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(`[KV] set(${key}) failed:`, err.message)
    }
    return false
  }
}

export async function kvDel(key) {
  const kv = await getKv()
  if (!kv) return false
  try {
    await withTimeout(kv.del(key))
    return true
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(`[KV] del(${key}) failed:`, err.message)
    }
    return false
  }
}

export async function kvMget(...keys) {
  const kv = await getKv()
  if (!kv) return keys.map(() => null)
  try {
    return await withTimeout(kv.mget(...keys))
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(`[KV] mget failed:`, err.message)
    }
    return keys.map(() => null)
  }
}

export async function kvKeys(pattern) {
  const kv = await getKv()
  if (!kv) return []
  try {
    return await withTimeout(kv.keys(pattern))
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(`[KV] keys(${pattern}) failed:`, err.message)
    }
    return []
  }
}

export async function kvIncr(key) {
  const kv = await getKv()
  if (!kv) return null
  try {
    return await withTimeout(kv.incr(key))
  } catch {
    return null
  }
}

export async function kvExpire(key, seconds) {
  const kv = await getKv()
  if (!kv) return false
  try {
    await withTimeout(kv.expire(key, seconds))
    return true
  } catch {
    return false
  }
}

export const kvAvailable = KV_AVAILABLE
