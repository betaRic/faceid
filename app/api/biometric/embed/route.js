import 'server-only'

import { NextResponse } from 'next/server'
import { getDb } from '@/lib/firebase-admin'
import { enforceRateLimit, getRequestIp } from '@/lib/rate-limit'
import { DESCRIPTOR_LENGTH } from '@/lib/config'

/**
 * Server-side face embedding endpoint.
 *
 * Accepts a base64-encoded JPEG frame from the client, extracts a 1024-dim
 * FaceRes descriptor using the WASM backend on the server, and returns it.
 *
 * This ensures the descriptor is generated in a controlled environment —
 * no GPU variance, no client-side tampering. Both enrollment and kiosk scan
 * can use this endpoint for authoritative embeddings.
 *
 * NOTE: This endpoint requires @vladmandic/human to work in Node.js with
 * the WASM backend. The current implementation validates the architecture
 * but delegates embedding to the client (WASM) for now. When full server-side
 * embedding is needed, this is where it plugs in.
 *
 * Vercel constraints:
 * - No tfjs-node (native binary too large for serverless)
 * - WASM backend works in Node.js serverless functions
 * - Cold start loads models (~2-5s), warm invocations ~200-500ms
 * - Pro plan: maxDuration 60s, 3GB RAM — sufficient for face embedding
 */

export const maxDuration = 30
export const dynamic = 'force-dynamic'

export async function POST(request) {
  const db = getDb()
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

  const frameDataUrl = typeof body?.frame === 'string' ? body.frame : ''
  if (!frameDataUrl || !frameDataUrl.startsWith('data:image/')) {
    return NextResponse.json(
      { ok: false, message: 'Frame must be a base64-encoded image data URL.' },
      { status: 400 },
    )
  }

  const maxFrameBytes = 2 * 1024 * 1024
  if (frameDataUrl.length > maxFrameBytes) {
    return NextResponse.json(
      { ok: false, message: 'Frame exceeds maximum size (2MB).' },
      { status: 400 },
    )
  }

  // -----------------------------------------------------------------------
  // SERVER-SIDE EMBEDDING PLACEHOLDER
  //
  // Full implementation requires @vladmandic/human running in Node.js with
  // WASM backend + sharp for image decoding. The pipeline:
  //
  //   1. Decode base64 JPEG → raw pixel buffer (sharp)
  //   2. Create tf.tensor3d from pixels
  //   3. Run human.detect(tensor) with WASM backend
  //   4. Extract face.embedding (1024-dim)
  //   5. Return normalized descriptor
  //
  // For now, the client generates the descriptor using the WASM backend
  // (which is deterministic across devices). This endpoint validates the
  // request format and returns a status indicating server embedding is
  // not yet active, so the client knows to use its own descriptor.
  //
  // To activate: install sharp, configure Human for Node.js WASM, and
  // replace the placeholder below with the actual embedding pipeline.
  // -----------------------------------------------------------------------

  return NextResponse.json({
    ok: true,
    serverEmbeddingAvailable: false,
    message: 'Server-side embedding endpoint is configured but not yet active. Client should use WASM-generated descriptor.',
    descriptorLength: DESCRIPTOR_LENGTH,
  })
}
