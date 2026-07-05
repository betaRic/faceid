import { NextResponse } from 'next/server'
import { existsSync } from 'fs'
import { getAdminSessionCookieName, parseAdminSessionCookieValue, resolveAdminSession } from '@/lib/admin-auth'
import { getLocalRuntimeCounts } from '@/lib/postgres/report-store'

export const dynamic = 'force-dynamic'

export async function GET(request) {
  const session = parseAdminSessionCookieValue(request.cookies.get(getAdminSessionCookieName())?.value)
  if (!session) {
    return NextResponse.json({ ok: false, message: 'Regional admin login is required.' }, { status: 401 })
  }

  const db = null
  const resolvedSession = await resolveAdminSession(db, session)
  if (!resolvedSession?.active || resolvedSession.scope !== 'regional') {
    return NextResponse.json({ ok: false, message: 'Regional admin access is required.' }, { status: 403 })
  }

  const storageDir = String(process.env.LOCAL_FILE_STORAGE_DIR || '').trim()
  const modelDir = String(process.env.OPENVINO_MODEL_DIR || '').trim()
  const counts = await getLocalRuntimeCounts()
  const warnings = []
  if (!process.env.ADMIN_SESSION_SECRET?.trim()) warnings.push('Admin session signing is not configured.')
  if (!process.env.HR_SESSION_SECRET?.trim()) warnings.push('HR session signing is not configured.')
  if (!process.env.HR_PIN_SALT?.trim() && !process.env.LOCAL_PIN_SALT?.trim()) warnings.push('Local PIN hashing salt is not configured.')
  if (!process.env.DATABASE_URL?.trim()) warnings.push('DATABASE_URL is not configured.')
  if (!storageDir) warnings.push('LOCAL_FILE_STORAGE_DIR is not configured.')
  else if (!existsSync(storageDir)) warnings.push('Local file storage directory does not exist yet.')
  if (modelDir && !existsSync(modelDir)) warnings.push('OpenVINO model directory was not found.')

  const ready = warnings.length === 0

  return NextResponse.json({
    ok: true,
    timestamp: new Date().toISOString(),
    runtime: 'local-node-postgres',
    backend: 'postgres',
    storage: {
      mode: 'local-filesystem',
      root: storageDir,
      ready: Boolean(storageDir && existsSync(storageDir)),
    },
    database: {
      connected: true,
      counts,
    },
    model: {
      openvinoModelRoot: modelDir,
      modelRootExists: Boolean(modelDir && existsSync(modelDir)),
    },
    auth: {
      pinOnly: true,
      adminSessionConfigured: Boolean(process.env.ADMIN_SESSION_SECRET?.trim()),
      hrSessionConfigured: Boolean(process.env.HR_SESSION_SECRET?.trim()),
      pinSaltConfigured: Boolean(process.env.HR_PIN_SALT?.trim() || process.env.LOCAL_PIN_SALT?.trim()),
    },
    productionReady: ready,
    scaleReady: ready,
    warnings,
    recommendation: ready
      ? 'Local Postgres/filesystem runtime is ready for LAN smoke testing.'
      : 'Complete the missing local runtime settings before LAN rollout.',
  })
}

