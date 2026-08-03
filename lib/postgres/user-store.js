import crypto from 'crypto'
import { getPostgresPool, queryPostgres } from './client'

function normalizeScope(value, fallback = 'office') {
  const normalized = String(value || fallback).trim().toLowerCase()
  return normalized === 'regional' ? 'regional' : 'office'
}

function defaultAdminPermissions(scope) {
  return scope === 'regional'
    ? ['dashboard', 'office', 'employees', 'summary', 'settings', 'roles']
    : ['dashboard', 'office', 'employees', 'summary']
}

function mapAdmin(row) {
  if (!row) return null
  const scope = normalizeScope(row.scope, 'regional')
  return {
    id: row.id,
    email: row.email || '',
    role: 'admin',
    permissions: Array.isArray(row.data?.permissions) ? row.data.permissions : defaultAdminPermissions(scope),
    scope,
    officeId: scope === 'office' ? String(row.office_id || '') : '',
    active: row.active !== false,
    displayName: row.display_name || row.name || '',
    pinHash: row.pin_hash || '',
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  }
}

function mapHr(row) {
  if (!row) return null
  const scope = normalizeScope(row.scope, 'office')
  return {
    id: row.id,
    email: row.email || '',
    displayName: row.display_name || row.name || '',
    scope,
    officeId: scope === 'office' ? String(row.office_id || '') : '',
    role: 'hr',
    permissions: Array.isArray(row.data?.permissions) && row.data.permissions.length > 0 ? row.data.permissions : ['employees', 'summary', 'dtr'],
    active: row.active !== false,
    pinHash: row.pin_hash || '',
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  }
}

export function hashLocalPin(pin) {
  const salt = process.env.LOCAL_PIN_SALT?.trim() || process.env.HR_PIN_SALT?.trim() || 'faceattend-local-pin-salt'
  return crypto.createHmac('sha256', salt).update(String(pin || '')).digest('hex')
}

export function verifyLocalPin(pin, storedHash) {
  if (!pin || !storedHash) return false
  const hashed = hashLocalPin(pin)
  const left = Buffer.from(hashed)
  const right = Buffer.from(String(storedHash || ''))
  return left.length === right.length && crypto.timingSafeEqual(left, right)
}

export async function getLocalAdminProfileByEmail(email) {
  const normalizedEmail = String(email || '').trim().toLowerCase()
  if (!normalizedEmail) return null
  const result = await queryPostgres(
    'SELECT * FROM admin_users WHERE email_lower = $1 AND active = true LIMIT 1',
    [normalizedEmail],
  )
  return mapAdmin(result.rows[0])
}

export async function listLocalAdminProfiles() {
  const result = await queryPostgres('SELECT * FROM admin_users ORDER BY email_lower ASC')
  return result.rows.map(mapAdmin)
}

export async function getLocalAdminCount() {
  const result = await queryPostgres('SELECT count(*)::integer AS count FROM admin_users')
  return Number(result.rows[0]?.count || 0)
}

export async function getLocalActiveRegionalAdminCount(excludeId = '') {
  const result = await queryPostgres(
    `
      SELECT count(*)::integer AS count
      FROM admin_users
      WHERE active = true
        AND scope <> 'office'
        AND ($1 = '' OR id <> $1)
    `,
    [String(excludeId || '')],
  )
  return Number(result.rows[0]?.count || 0)
}

export async function findLocalAdminByPin(pin) {
  const result = await queryPostgres('SELECT * FROM admin_users WHERE active = true')
  return result.rows.map(mapAdmin).find(user => verifyLocalPin(pin, user.pinHash)) || null
}

export async function createLocalAdminProfile(body = {}) {
  const id = crypto.randomUUID()
  const email = String(body.email || '').trim().toLowerCase()
  const displayName = String(body.displayName || '').trim()
  const scope = normalizeScope(body.scope, 'office')
  const officeId = scope === 'office' ? String(body.officeId || '').trim() : ''
  const pinHash = body.pin ? hashLocalPin(body.pin) : null
  await queryPostgres(
    `
      INSERT INTO admin_users (
        id, email, email_lower, name, display_name, role, scope, office_id,
        active, pin_hash, data, updated_at
      )
      VALUES ($1, $2, $3, $4, $4, 'admin', $5, $6, $7, $8, $9::jsonb, now())
    `,
    [
      id,
      email,
      email,
      displayName || email,
      scope,
      officeId,
      body.active !== false,
      pinHash,
      JSON.stringify({ permissions: defaultAdminPermissions(scope) }),
    ],
  )
  return id
}

export async function updateLocalAdminProfile(adminId, body = {}) {
  const email = String(body.email || '').trim().toLowerCase()
  const displayName = String(body.displayName || '').trim()
  const scope = normalizeScope(body.scope, 'office')
  const officeId = scope === 'office' ? String(body.officeId || '').trim() : ''
  await queryPostgres(
    `
      UPDATE admin_users
      SET email = $2,
          email_lower = $2,
          name = $3,
          display_name = $3,
          scope = $4,
          office_id = $5,
          active = $6,
          updated_at = now()
      WHERE id = $1
    `,
    [adminId, email, displayName || email, scope, officeId, body.active !== false],
  )
}

export async function deleteLocalAdminProfile(adminId) {
  await queryPostgres('DELETE FROM admin_users WHERE id = $1', [adminId])
}

export async function getLocalAdminProfileById(adminId) {
  const result = await queryPostgres('SELECT * FROM admin_users WHERE id = $1 LIMIT 1', [String(adminId || '')])
  return mapAdmin(result.rows[0])
}

export async function getLocalHrProfileByEmail(email) {
  const normalizedEmail = String(email || '').trim().toLowerCase()
  if (!normalizedEmail) return null
  const result = await queryPostgres(
    'SELECT * FROM hr_users WHERE email_lower = $1 LIMIT 1',
    [normalizedEmail],
  )
  return mapHr(result.rows[0])
}

export async function getLocalHrProfileById(hrUserId) {
  const result = await queryPostgres('SELECT * FROM hr_users WHERE id = $1 LIMIT 1', [String(hrUserId || '')])
  return mapHr(result.rows[0])
}

export async function listLocalHrProfiles() {
  const result = await queryPostgres('SELECT * FROM hr_users ORDER BY display_name ASC, email_lower ASC')
  return result.rows.map(mapHr)
}

export async function getLocalHrCount() {
  const result = await queryPostgres('SELECT count(*)::integer AS count FROM hr_users')
  return Number(result.rows[0]?.count || 0)
}

export async function findLocalHrByPin(pin) {
  const result = await queryPostgres('SELECT * FROM hr_users WHERE active = true')
  return result.rows.map(mapHr).find(user => verifyLocalPin(pin, user.pinHash)) || null
}

export async function createLocalHrProfile(body = {}) {
  const id = crypto.randomUUID()
  const email = String(body.email || '').trim().toLowerCase()
  const displayName = String(body.displayName || '').trim()
  const scope = normalizeScope(body.scope, 'office')
  const officeId = scope === 'office' ? String(body.officeId || '').trim() : ''
  const pinHash = body.pin ? hashLocalPin(body.pin) : null
  await queryPostgres(
    `
      INSERT INTO hr_users (
        id, email, email_lower, name, display_name, scope, office_id,
        active, pin_hash, data, updated_at
      )
      VALUES ($1, $2, $3, $4, $4, $5, $6, $7, $8, $9::jsonb, now())
    `,
    [
      id,
      email || `${id}@local`,
      email || `${id}@local`,
      displayName || email || 'HR User',
      scope,
      officeId,
      body.active !== false,
      pinHash,
      JSON.stringify({ permissions: ['employees', 'summary', 'dtr'] }),
    ],
  )
  return id
}

export async function updateLocalHrProfile(hrUserId, body = {}) {
  const email = String(body.email || '').trim().toLowerCase()
  const displayName = String(body.displayName || '').trim()
  const scope = normalizeScope(body.scope, 'office')
  const officeId = scope === 'office' ? String(body.officeId || '').trim() : ''
  const args = [hrUserId, email || `${hrUserId}@local`, displayName || email || 'HR User', scope, officeId, body.active !== false]
  let pinSql = ''
  if (body.pin) {
    args.push(hashLocalPin(body.pin))
    pinSql = `, pin_hash = $${args.length}`
  }
  await queryPostgres(
    `
      UPDATE hr_users
      SET email = $2,
          email_lower = $2,
          name = $3,
          display_name = $3,
          scope = $4,
          office_id = $5,
          active = $6,
          updated_at = now()
          ${pinSql}
      WHERE id = $1
    `,
    args,
  )
}

export async function deleteLocalHrProfile(hrUserId) {
  await queryPostgres('DELETE FROM hr_users WHERE id = $1', [hrUserId])
}

export async function localEmailExists(table, email, excludeId = '') {
  const client = await getPostgresPool().connect()
  try {
    const tableName = table === 'hr_users' ? 'hr_users' : 'admin_users'
    const result = await client.query(
      `SELECT id FROM ${tableName} WHERE email_lower = $1 AND ($2 = '' OR id <> $2) LIMIT 1`,
      [String(email || '').trim().toLowerCase(), String(excludeId || '')],
    )
    return Boolean(result.rows[0])
  } finally {
    client.release()
  }
}
