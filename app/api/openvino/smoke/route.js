import { timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

function safeEqual(left, right) {
  const a = Buffer.from(String(left || ''))
  const b = Buffer.from(String(right || ''))
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

function getBearerToken(request) {
  const authorization = request.headers.get('authorization') || ''
  const match = authorization.match(/^Bearer\s+(.+)$/i)
  return match?.[1] || request.headers.get('x-openvino-benchmark-secret') || ''
}

function requireBenchmarkSecret(request) {
  const secret = process.env.OPENVINO_BENCHMARK_SECRET?.trim()
  if (!secret) {
    return NextResponse.json({ ok: false, message: 'OpenVINO benchmark endpoint is not configured.' }, { status: 404 })
  }
  if (!safeEqual(getBearerToken(request), secret)) {
    return NextResponse.json({ ok: false, message: 'Unauthorized.' }, { status: 401 })
  }
  return null
}

export async function GET(request) {
  const authError = requireBenchmarkSecret(request)
  if (authError) return authError

  const {
    getMissingOpenVinoRetailModelFiles,
    getOpenVinoRetailModelPaths,
  } = await import('@/lib/biometrics/openvino-retail-embedding')
  const missing = getMissingOpenVinoRetailModelFiles()

  return NextResponse.json({
    ok: missing.length === 0,
    modelPaths: getOpenVinoRetailModelPaths(),
    missingModelFiles: missing,
  }, { status: missing.length === 0 ? 200 : 503 })
}

export async function POST(request) {
  const authError = requireBenchmarkSecret(request)
  if (authError) return authError

  const body = await request.json().catch(() => null)
  const frameDataUrl = typeof body?.frameDataUrl === 'string' ? body.frameDataUrl : ''
  if (!/^data:image\/(?:jpeg|jpg|png|webp);base64,/i.test(frameDataUrl)) {
    return NextResponse.json({ ok: false, message: 'frameDataUrl must be a JPEG, PNG, or WebP data URL.' }, { status: 400 })
  }

  const { generateOpenVinoRetailEmbedding } = await import('@/lib/biometrics/openvino-retail-embedding')
  const result = await generateOpenVinoRetailEmbedding(frameDataUrl)
  const allowDescriptorReturn = process.env.OPENVINO_BENCHMARK_RETURN_DESCRIPTOR === 'true'

  if (!result.ok) {
    return NextResponse.json({
      ok: false,
      decisionCode: result.decisionCode || 'blocked_embedding_failed',
      message: result.message || 'OpenVINO embedding failed.',
      performanceMs: result.performanceMs ?? null,
    }, { status: 422 })
  }

  return NextResponse.json({
    ok: true,
    modelVersion: result.modelVersion,
    descriptorLength: result.descriptorLength,
    distanceMetric: result.distanceMetric,
    performanceMs: result.performanceMs,
    faceScore: result.face?.score ?? null,
    faceBox: result.face?.box ?? null,
    devices: result.diagnostics?.devices || [],
    descriptor: allowDescriptorReturn ? result.descriptor : undefined,
  })
}
