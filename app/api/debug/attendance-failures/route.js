export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getAdminDb } from '@/lib/firebase-admin'

export async function GET(request) {
  try {
    const db = getAdminDb()
    
    const { searchParams } = new URL(request.url)
    const limit = Math.min(parseInt(searchParams.get('limit') || '10'), 50)

    const snapshot = await db.collection('audit_logs')
      .orderBy('createdAt', 'desc')
      .limit(limit)
      .get()

    const logs = snapshot.docs.map(doc => {
      const data = doc.data()
      return {
        id: doc.id,
        action: data.action,
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
<h1>Last ${logs.length} Audit Logs</h1>
<pre>${JSON.stringify(logs, null, 2)}</pre>
</body>
</html>`

    return new NextResponse(html, {
      headers: { 'Content-Type': 'text/html' },
    })
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}