// Local in-memory cache utilities for the offline LAN runtime.

const store = new Map()

function nowMs() {
  return Date.now()
}

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

function readEntry(key) {
  const entry = store.get(withKeyPrefix(key))
  if (!entry) return null
  if (entry.expiresAt && entry.expiresAt <= nowMs()) {
    store.delete(withKeyPrefix(key))
    return null
  }
  return entry
}

export async function getKvClient() {
  return null
}

export async function kvGet(key) {
  return readEntry(key)?.value ?? null
}

export async function kvSet(key, value, options = {}) {
  const seconds = Number(options.ex || 0)
  store.set(withKeyPrefix(key), {
    value,
    expiresAt: seconds > 0 ? nowMs() + seconds * 1000 : 0,
  })
  return true
}

export async function kvMget(...keys) {
  return Promise.all(keys.map(key => kvGet(key)))
}

export async function kvKeys(pattern) {
  const prefixedPattern = withKeyPrefix(pattern).replace(/\*/g, '.*')
  const regex = new RegExp(`^${prefixedPattern}$`)
  return Array.from(store.keys()).filter(key => regex.test(key))
}

export async function kvDel(key) {
  return store.delete(withKeyPrefix(key))
}

export async function kvIncr(key) {
  const current = Number((await kvGet(key)) || 0)
  const next = current + 1
  await kvSet(key, next)
  return next
}

export async function kvIncrWithExpire(key, seconds) {
  const current = Number((await kvGet(key)) || 0)
  const next = current + 1
  await kvSet(key, next, { ex: seconds })
  return next
}

export async function kvExpire(key, seconds) {
  const entry = readEntry(key)
  if (!entry) return false
  store.set(withKeyPrefix(key), {
    ...entry,
    expiresAt: nowMs() + Number(seconds || 0) * 1000,
  })
  return true
}

export async function kvAvailable() {
  return true
}
