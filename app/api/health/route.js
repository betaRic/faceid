import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  return NextResponse.json({
    ok: true,
    kind: 'process-health',
    service: 'faceattend',
    timestamp: new Date().toISOString(),
  })
}
