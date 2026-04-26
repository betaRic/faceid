import 'server-only'

import { NextResponse } from 'next/server'
import { getAdminDb } from '@/lib/firebase-admin'
import { enforceRateLimit, getRequestIp } from '@/lib/rate-limit'
import { DESCRIPTOR_LENGTH } from '@/lib/config'
import { createOriginGuard } from '@/lib/csrf'
import { generateServerFaceEmbedding } from '@/lib/biometrics/server-embedding'

/**
 * Optional server-side face embedding diagnostic endpoint.
 *
 * Accepts a base64-encoded JPEG frame from the client, extracts a 1024-dim
 * FaceRes descriptor using the WASM backend on the server, and returns it.
 *
 * This ensures the descriptor is generated in a controlled environment —
 * no GPU variance, no client-side descriptor tampering. The production
 * enrollment and attendance APIs call the embedding module directly; this
 * endpoint stays disabled unless explicitly enabled for diagnostics.
 *
 * Browser descriptors are not accepted here. The server decodes the submitted
 * still frame, runs Human with the Node WASM backend, and returns the descriptor
 * generated inside the trusted server process.
 */

export const maxDuration = 30
export const dynamic = 'force-dynamic'

function toHttpStatus(value) {
  const status = Number(value)
  return Number.isInteger(status) && status >= 400 && status <= 599 ? status : 500
}

export async function POST(request) {
  if (process.env.ENABLE_PUBLIC_BIOMETRIC_EMBED_API !== 'true') {
    return NextResponse.json(
      { ok: false, message: 'Public biometric embedding endpoint is disabled.' },
      { status: 404 },
    )
  }

  const guard = createOriginGuard()
  const originError = await guard(request)
  if (originError) return originError

  const db = getAdminDb()
  const ip = getRequestIp(request)

  const rateCheck = await enforceRateLimit(db, {
    key: `embed-ip:${ip}`,
    limit: 30,
    windowMs: 60 * 1000,
  })
  if (!rateCheck.ok) {
    return NextResponse.json(
      { ok: false, message: 'Too many embedding requests.' },
      { status: 429 },
    )
  }

  let body
  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { ok: false, message: 'Invalid request body.' },
      { status: 400 },
    )
  }

  const frameDataUrl = typeof body?.frameDataUrl === 'string'
    ? body.frameDataUrl
    : (typeof body?.frame === 'string' ? body.frame : '')
  if (!frameDataUrl || !frameDataUrl.startsWith('data:image/')) {
    return NextResponse.json(
      { ok: false, message: 'Frame must be a base64-encoded image data URL.' },
      { status: 400 },
    )
  }

  const maxFrameDataUrlLength = Math.ceil((2 * 1024 * 1024 * 4) / 3) + 128
  if (frameDataUrl.length > maxFrameDataUrlLength) {
    return NextResponse.json(
      { ok: false, message: 'Frame exceeds maximum size (2MB).' },
      { status: 400 },
    )
  }

  try {
    const embedding = await generateServerFaceEmbedding(frameDataUrl)
    return NextResponse.json({
      serverEmbeddingAvailable: true,
      descriptorLength: DESCRIPTOR_LENGTH,
      ...embedding,
    }, { status: embedding.ok ? 200 : 422 })
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        serverEmbeddingAvailable: true,
        message: error?.message || 'Server-side embedding failed.',
      },
      { status: toHttpStatus(error?.status) },
    )
  }
}
