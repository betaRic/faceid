import { NextResponse } from 'next/server'
import { getRuntimeReadiness } from '@/lib/runtime-readiness'

export const dynamic = 'force-dynamic'

export async function GET() {
  const readiness = getRuntimeReadiness()

  return NextResponse.json({
    ok: true,
    timestamp: new Date().toISOString(),
    runtime: 'vercel-node-compatible',
    ...readiness,
    recommendation: readiness.productionReady
      ? 'Runtime configuration is present. Continue with controlled pilot testing before production use.'
      : 'Set the missing environment variables before deployment.',
  })
}

