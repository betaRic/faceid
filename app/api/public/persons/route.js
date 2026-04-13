export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getAdminDb } from '@/lib/firebase-admin'
import { mapPersonRecord } from '@/lib/persons'

export async function GET() {
  try {
    const db = getAdminDb()
    const snapshot = await db.collection('persons')
      .where('active', '==', true)
      .where('approvalStatus', '==', 'approved')
      .get()

    const persons = snapshot.docs.map(doc => {
      const data = doc.data()
      return {
        id: doc.id,
        name: data.name,
        employeeId: data.employeeId,
        nameLower: data.nameLower,
        officeId: data.officeId,
        officeName: data.officeName,
        descriptors: data.descriptors || [],
        active: data.active,
        approvalStatus: data.approvalStatus,
      }
    })

    return NextResponse.json({ ok: true, persons })
  } catch (error) {
    return NextResponse.json({ ok: false, message: 'Failed to load persons' }, { status: 500 })
  }
}
