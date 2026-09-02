export const dynamic = 'force-dynamic'

import { buildAuthoritativeEnrollmentPayload } from '@/lib/biometrics/server-enrollment'
import { enrollLocalPerson } from '@/lib/postgres/person-store'
import { normalizeDataImage } from '@/lib/images/safe-data-image'
import { createPersonsGetHandler, createPersonsPostHandler } from '@/lib/routes/persons-route'

export const GET = createPersonsGetHandler()

export const POST = createPersonsPostHandler({
  buildAuthoritativeEnrollmentPayload,
  enrollLocalPerson,
  normalizeDataImage,
  writeTelemetry: async ({ elapsedMs, marks }) => {
    if (elapsedMs < 3000) return
    console.warn('[PersonsAPI] Slow POST /api/persons', { elapsedMs, marks })
  },
})

