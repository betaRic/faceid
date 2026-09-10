import { beforeEach, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ session: { scope: 'regional', role: 'admin' }, location: vi.fn(), phone: vi.fn(), query: vi.fn() }))
vi.mock('server-only', () => ({}))
vi.mock('@/lib/admin-auth', () => ({ getAdminSessionCookieName: () => 'session', parseAdminSessionCookieValue: value => value ? {} : null, resolveAdminSession: async () => mocks.session }))
vi.mock('@/lib/postgres/client', () => ({ queryPostgres: (...args) => mocks.query(...args) }))
vi.mock('@/lib/postgres/phone-scan-reports', () => ({ loadLocationReports: (...args) => mocks.location(...args), loadPhoneScanReports: (...args) => mocks.phone(...args) }))
vi.mock('@/lib/maintenance/system-evidence', () => ({ buildSystemEvidence: async () => ({}) }))
vi.mock('@/lib/maintenance/event-evidence', () => ({ buildMaintenanceEvidenceReport: () => ({ version: 2 }) }))
import { GET } from '@/app/api/admin/biometric-benchmark/route'
beforeEach(() => {
  vi.clearAllMocks()
  mocks.session = { scope: 'regional', role: 'admin' }
  mocks.query.mockResolvedValue({ rows: [] })
  mocks.location.mockResolvedValue({ available: true, total: 1, groups: [] })
  mocks.phone.mockResolvedValue({ available: true, total: 0 })
})
const request = value => ({ url: 'http://localhost/api/admin/biometric-benchmark?days=7', cookies: { get: () => ({ value }) } })
it('includes location evidence only for Regional Admin scope', async () => {
  expect((await (await GET(request('valid'))).json()).locationReports.total).toBe(1)
  expect(mocks.location).toHaveBeenCalledTimes(1)
  mocks.session = { scope: 'office', officeId: 'office-a', role: 'hr' }
  expect((await (await GET(request('valid'))).json()).locationReports).toBeNull()
  expect(mocks.location).toHaveBeenCalledTimes(1)
})
it('refuses unauthenticated evidence requests before loading data', async () => {
  expect((await GET(request(null))).status).toBe(401)
  expect(mocks.location).not.toHaveBeenCalled()
})
