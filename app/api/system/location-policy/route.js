export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getActiveThresholds } from '@/lib/thresholds'

export async function GET() {
  const settings = await getActiveThresholds(null)
  return NextResponse.json({ ok: true, policy: {
    bootTimeoutMs: settings.locationBootTimeoutMs,
    targetAccuracyMeters: settings.locationTargetAccuracyMeters,
    maxAccuracyMeters: settings.locationMaxAccuracyMeters,
    sampleCount: settings.locationSampleCount,
  } }, { headers: { 'Cache-Control': 'no-store' } })
}
