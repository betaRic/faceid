export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { serverErrorResponse } from '@/lib/http/server-error'
import { listOfficeRecords } from '@/lib/office-directory'

function toPublicOffice(office) {
  return {
    id: String(office?.id || ''),
    code: String(office?.code || ''),
    officeType: String(office?.officeType || ''),
    name: String(office?.name || ''),
    shortName: String(office?.shortName || ''),
    location: String(office?.location || ''),
    provinceOrCity: String(office?.provinceOrCity || ''),
    status: String(office?.status || 'active'),
    divisions: Array.isArray(office?.divisions)
      ? office.divisions.map(d => ({
          id: String(d?.id || ''),
          name: String(d?.name || ''),
          shortName: String(d?.shortName || ''),
        }))
      : [],
  }
}

export function createPublicOfficesGetHandler({ listOffices = listOfficeRecords } = {}) {
  return async function getPublicOffices() {
    try {
      const offices = await listOffices(null)
      return NextResponse.json({
        ok: true,
        offices: offices
          .filter(office => (office?.status || 'active') !== 'inactive')
          .map(toPublicOffice),
      })
    } catch (error) {
      return serverErrorResponse(error, {
        context: 'api/public/offices:GET',
        publicMessage: 'Failed to load offices.',
      })
    }
  }
}

export const GET = createPublicOfficesGetHandler()


