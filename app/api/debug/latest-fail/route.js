export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getAdminDb } from '@/lib/firebase-admin'

export async function GET() {
  const db = getAdminDb()
  
  const snapshot = await db.collection('audit_logs')
    .where('action', '==', 'attendance_scan_failed')
    .orderBy('createdAt', 'desc')
    .limit(1)
    .get()

  if (snapshot.empty) {
    return NextResponse.json({ error: 'No logs' })
  }

  const doc = snapshot.docs[0]
  const data = doc.data()

  return NextResponse.json({
    id: doc.id,
    metadata: data.metadata,
  })
}