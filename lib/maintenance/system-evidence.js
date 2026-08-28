import { constants as fsConstants } from 'node:fs'
import { access as fsAccess, readFile as fsReadFile, readdir as fsReaddir } from 'node:fs/promises'
import path from 'node:path'

const phDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Manila',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

const HUMAN_REQUIRED_FILES = Object.freeze([
  'blazeface.json',
  'blazeface.bin',
  'facemesh.json',
  'facemesh.bin',
  'iris.json',
  'iris.bin',
  'faceres.json',
  'faceres.bin',
  'antispoof.json',
  'antispoof.bin',
  'liveness.json',
  'liveness.bin',
])

const OPENVINO_REQUIRED_FILES = Object.freeze([
  ['face-detection-retail-0004', 'FP16', 'face-detection-retail-0004.xml'],
  ['face-detection-retail-0004', 'FP16', 'face-detection-retail-0004.bin'],
  ['landmarks-regression-retail-0009', 'FP16', 'landmarks-regression-retail-0009.xml'],
  ['landmarks-regression-retail-0009', 'FP16', 'landmarks-regression-retail-0009.bin'],
  ['face-reidentification-retail-0095', 'FP16', 'face-reidentification-retail-0095.xml'],
  ['face-reidentification-retail-0095', 'FP16', 'face-reidentification-retail-0095.bin'],
])

function safeText(value) {
  return String(value || '').trim()
}

async function canAccess(access, target, mode) {
  try {
    await access(target, mode)
    return true
  } catch {
    return false
  }
}

async function checkFiles(access, files) {
  const missing = []
  for (const file of files) {
    if (!await canAccess(access, file.path, fsConstants.R_OK)) missing.push(file.label)
  }
  return {
    ready: missing.length === 0,
    requiredFileCount: files.length,
    presentFileCount: files.length - missing.length,
    missing,
  }
}

async function readBuildId(readFile, cwd) {
  try {
    return safeText(await readFile(path.join(cwd, '.next', 'BUILD_ID'), 'utf8')) || null
  } catch {
    return null
  }
}

async function loadMigrationEvidence({ query, readdir, cwd }) {
  try {
    const expected = (await readdir(path.join(cwd, 'db', 'migrations')))
      .filter(file => String(file).endsWith('.sql'))
      .sort()
    const appliedResult = await query('SELECT version FROM schema_migrations ORDER BY version')
    const applied = appliedResult.rows.map(row => safeText(row.version)).filter(Boolean).sort()
    const appliedSet = new Set(applied)
    const expectedSet = new Set(expected)
    const pending = expected.filter(version => !appliedSet.has(version))
    const unexpected = applied.filter(version => !expectedSet.has(version))
    return {
      status: pending.length ? 'failing' : unexpected.length ? 'warning' : 'healthy',
      expectedCount: expected.length,
      appliedCount: applied.length,
      pending,
      unexpected,
    }
  } catch {
    return {
      status: 'unknown',
      expectedCount: null,
      appliedCount: null,
      pending: [],
      unexpected: [],
    }
  }
}

async function loadDatabaseEvidence(query) {
  const startedAt = performance.now()
  try {
    const versionResult = await query('SHOW server_version')
    const latencyMs = Math.max(0, Math.round(performance.now() - startedAt))
    const countsResult = await query(`
      SELECT
        (SELECT count(*)::integer FROM offices) AS offices,
        (SELECT count(*)::integer FROM persons) AS persons,
        (SELECT count(*)::integer FROM persons WHERE approval_status = 'pending') AS pending_persons,
        (SELECT count(*)::integer FROM biometric_index) AS biometric_index,
        (SELECT count(*)::integer FROM attendance) AS attendance,
        (SELECT count(*)::integer FROM attendance_daily) AS attendance_daily,
        (SELECT count(*)::integer FROM scan_events) AS scan_events,
        (SELECT count(*)::integer FROM audit_logs) AS audit_logs,
        (SELECT count(*)::integer FROM admin_users) AS admin_users,
        (SELECT count(*)::integer FROM hr_users) AS hr_users
    `)
    return {
      status: 'healthy',
      connected: true,
      latencyMs,
      serverVersion: safeText(versionResult.rows[0]?.server_version) || null,
      counts: countsResult.rows[0] || {},
    }
  } catch {
    return {
      status: 'failing',
      connected: false,
      latencyMs: Math.max(0, Math.round(performance.now() - startedAt)),
      serverVersion: null,
      counts: {},
    }
  }
}

async function loadDailySummaryEvidence(query, now) {
  const dateKey = phDateFormatter.format(new Date(Number(now) - 86_400_000))
  try {
    const result = await query(`
      WITH raw AS (
        SELECT
          person_id,
          count(*)::integer AS log_count,
          max(created_at) AS newest_raw_at
        FROM attendance
        WHERE date_key = $1 AND NULLIF(person_id, '') IS NOT NULL
        GROUP BY person_id
      ), daily AS (
        SELECT person_id, log_count, updated_at
        FROM attendance_daily
        WHERE date_key = $1 AND NULLIF(person_id, '') IS NOT NULL
      ), parity AS (
        SELECT
          raw.person_id AS raw_person_id,
          daily.person_id AS daily_person_id,
          raw.log_count AS raw_log_count,
          daily.log_count AS daily_log_count,
          raw.newest_raw_at,
          daily.updated_at
        FROM raw
        FULL OUTER JOIN daily ON daily.person_id = raw.person_id
      )
      SELECT
        count(raw_person_id)::integer AS raw_person_count,
        count(daily_person_id)::integer AS summary_person_count,
        count(*) FILTER (WHERE raw_person_id IS NOT NULL AND daily_person_id IS NULL)::integer AS missing_summary_count,
        count(*) FILTER (WHERE raw_person_id IS NULL AND daily_person_id IS NOT NULL)::integer AS unexpected_summary_count,
        count(*) FILTER (
          WHERE raw_person_id IS NOT NULL
            AND daily_person_id IS NOT NULL
            AND (raw_log_count <> daily_log_count OR updated_at < newest_raw_at)
        )::integer AS stale_summary_count,
        max(updated_at) AS newest_summary_at
      FROM parity
    `, [dateKey])
    const row = result.rows[0] || {}
    const rawPersonCount = Number(row.raw_person_count || 0)
    const summaryPersonCount = Number(row.summary_person_count || 0)
    const missingSummaryCount = Number(row.missing_summary_count || 0)
    const unexpectedSummaryCount = Number(row.unexpected_summary_count || 0)
    const staleSummaryCount = Number(row.stale_summary_count || 0)
    const parityMismatchCount = missingSummaryCount + unexpectedSummaryCount + staleSummaryCount
    return {
      status: parityMismatchCount > 0 ? 'stale' : 'fresh',
      dateKey,
      rawPersonCount,
      summaryPersonCount,
      missingSummaryCount,
      unexpectedSummaryCount,
      staleSummaryCount,
      parityMismatchCount,
      newestSummaryAt: row.newest_summary_at
        ? new Date(row.newest_summary_at).toISOString()
        : null,
    }
  } catch {
    return {
      status: 'unknown',
      dateKey,
      rawPersonCount: null,
      summaryPersonCount: null,
      missingSummaryCount: null,
      unexpectedSummaryCount: null,
      staleSummaryCount: null,
      parityMismatchCount: null,
      newestSummaryAt: null,
    }
  }
}

export async function buildSystemEvidence({
  query,
  now = Date.now(),
  env = process.env,
  cwd = process.cwd(),
  access = fsAccess,
  readFile = fsReadFile,
  readdir = fsReaddir,
  uptime = process.uptime,
  nodeVersion = process.version,
} = {}) {
  if (typeof query !== 'function') throw new TypeError('A read-only PostgreSQL query function is required.')

  const configuredStorageRoot = safeText(env.LOCAL_FILE_STORAGE_DIR)
  const storageRoot = configuredStorageRoot || path.join(cwd, 'App_Data', 'veriface-files')
  const storageDirectoryExists = await canAccess(access, storageRoot, fsConstants.F_OK)
  const storage = {
    status: !storageDirectoryExists
      ? 'failing'
      : await canAccess(access, storageRoot, fsConstants.W_OK)
        ? 'healthy'
        : 'failing',
    configured: Boolean(configuredStorageRoot),
    directoryExists: storageDirectoryExists,
    readable: storageDirectoryExists && await canAccess(access, storageRoot, fsConstants.R_OK),
    writable: storageDirectoryExists && await canAccess(access, storageRoot, fsConstants.W_OK),
  }

  const humanRoot = path.join(cwd, 'public', 'models', 'human')
  const human = await checkFiles(access, HUMAN_REQUIRED_FILES.map(label => ({
    label,
    path: path.join(humanRoot, label),
  })))
  human.status = human.ready ? 'healthy' : 'failing'

  const openvinoRoot = safeText(env.OPENVINO_MODEL_DIR)
  const openvino = openvinoRoot
    ? await checkFiles(access, OPENVINO_REQUIRED_FILES.map(parts => ({
        label: parts.at(-1),
        path: path.join(openvinoRoot, ...parts),
      })))
    : { ready: false, requiredFileCount: OPENVINO_REQUIRED_FILES.length, presentFileCount: 0, missing: [], configured: false }
  openvino.configured = Boolean(openvinoRoot)
  openvino.status = !openvino.configured ? 'unconfigured' : openvino.ready ? 'healthy' : 'failing'
  openvino.inferenceVerified = false

  const [database, migrations, dailySummary, buildId] = await Promise.all([
    loadDatabaseEvidence(query),
    loadMigrationEvidence({ query, readdir, cwd }),
    loadDailySummaryEvidence(query, now),
    readBuildId(readFile, cwd),
  ])

  const auth = {
    adminSessionConfigured: Boolean(safeText(env.ADMIN_SESSION_SECRET)),
    hrSessionConfigured: Boolean(safeText(env.HR_SESSION_SECRET)),
    pinSaltConfigured: Boolean(safeText(env.HR_PIN_SALT || env.LOCAL_PIN_SALT)),
    cronSecretConfigured: Boolean(safeText(env.CRON_SECRET)),
  }
  const runtime = {
    status: database.connected && human.ready && storage.writable ? 'healthy' : 'failing',
    nodeVersion: safeText(nodeVersion),
    environment: safeText(env.NODE_ENV) || 'unknown',
    uptimeSeconds: Math.max(0, Math.round(Number(uptime()) || 0)),
    buildId,
    buildIdentified: Boolean(buildId),
  }
  const actions = []
  if (!database.connected) {
    actions.push({
      id: 'database',
      severity: 'critical',
      title: 'Restore database readiness',
      detail: 'The maintenance database check failed.',
    })
  }
  if (migrations.status !== 'healthy') {
    actions.push({
      id: 'migrations',
      severity: migrations.status === 'failing' ? 'critical' : 'warning',
      title: migrations.status === 'failing' ? 'Resolve pending migrations' : 'Verify migration state',
      detail: migrations.status === 'failing'
        ? `${migrations.pending.length} expected migration(s) are not recorded as applied.`
        : migrations.status === 'warning'
          ? `${migrations.unexpected.length} applied migration(s) are not present in this build.`
          : 'Migration state could not be verified.',
    })
  }
  if (storage.status === 'failing') {
    actions.push({
      id: 'storage',
      severity: 'critical',
      title: 'Restore file storage readiness',
      detail: 'Persistent biometric and photo storage is not writable.',
    })
  }
  if (human.status === 'failing') {
    actions.push({
      id: 'human-models',
      severity: 'critical',
      title: 'Restore Human model files',
      detail: `${human.missing.length} required model file(s) are unavailable.`,
    })
  }
  if (dailySummary.status === 'stale' || dailySummary.status === 'unknown') {
    actions.push({
      id: 'daily-summary',
      severity: 'warning',
      title: 'Repair daily summary evidence',
      detail: dailySummary.status === 'stale'
        ? `${dailySummary.parityMismatchCount} person-level mismatch(es) were detected.`
        : 'Daily summary parity could not be verified.',
    })
  }

  return {
    status: [database.status, migrations.status, storage.status, human.status, dailySummary.status].some(value => value === 'failing')
      ? 'failing'
      : [migrations.status, dailySummary.status].some(value => value === 'unknown' || value === 'stale')
        ? 'warning'
        : 'healthy',
    database,
    migrations,
    storage,
    models: { human, openvino },
    runtime,
    auth,
    dailySummary,
    actions,
  }
}
