export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getActiveThresholds } from '@/lib/thresholds'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

const buildId = readFile(path.join(process.cwd(), '.next', 'BUILD_ID'), 'utf8').then(v => v.trim()).catch(() => 'unknown')

export async function GET() {
  const settings = await getActiveThresholds(null)
  return NextResponse.json({ ok: true, policy: {
    buildId: await buildId,
    bootTimeoutMs: settings.locationBootTimeoutMs,
    targetAccuracyMeters: settings.locationTargetAccuracyMeters,
    maxAccuracyMeters: settings.locationMaxAccuracyMeters,
    sampleCount: settings.locationSampleCount,
  } }, { headers: { 'Cache-Control': 'no-store' } })
}
