export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getAdminDb } from '@/lib/firebase-admin'

export async function GET(request) {
  const db = getAdminDb()
  
  const { searchParams } = new URL(request.url)
  const limit = Math.min(parseInt(searchParams.get('limit') || '10'), 50)

  const snapshot = await db.collection('audit_logs')
    .where('action', '==', 'attendance_scan_failed')
    .orderBy('createdAt', 'desc')
    .limit(limit)
    .get()

  const logs = snapshot.docs.map(doc => {
    const data = doc.data()
    return {
      id: doc.id,
      decisionCode: data.metadata?.decisionCode,
      reason: data.metadata?.reason,
      bestDistance: data.metadata?.bestDistance,
      candidatesFound: data.metadata?.candidatesFound,
      threshold: data.metadata?.threshold,
      storedDescSample: data.metadata?.storedDescriptorSample,
      queryDescSample: data.metadata?.queryDescriptorSample,
      storedMag: data.metadata?.storedMagnitude,
      queryMag: data.metadata?.queryMagnitude,
      createdAt: data.createdAt?.toDate?.()?.toISOString(),
    }
  })

  const html = `<!DOCTYPE html>
<html>
<head><title>Debug</title></head>
<body>
<h1>Last ${logs.length} Failed Attendance</h1>
<pre>${JSON.stringify(logs, null, 2)}</pre>
</body>
</html>`

  return new NextResponse(html, {
    headers: { 'Content-Type': 'text/html' },
  })
}