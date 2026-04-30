import {
  clampPersonDirectoryLimit,
  decodePersonDirectoryCursor,
  encodePersonDirectoryCursor,
  getPersonDirectorySortFields,
  inferPersonDirectorySearchMode,
  normalizePersonDirectorySearchValue,
} from '@/lib/person-directory'
import { normalizeStoredDescriptors } from '@/lib/biometrics/descriptor-utils'
import { getEffectivePersonApprovalStatus } from '@/lib/person-approval'

export const PERSON_DIRECTORY_FIELDS = [
  'name',
  'employeeId',
  'position',
  'nameLower',
  'officeId',
  'officeName',
  'divisionId',
  'divisionName',
  'active',
  'approvalStatus',
  'sampleCount',
  'duplicateReviewRequired',
  'duplicateReviewStatus',
  'duplicateReviewCandidateName',
  'duplicateReviewCandidateEmployeeId',
  'duplicateReviewDistance',
  'duplicateReviewReasonCode',
  'photoPath',
  'photoUrl',
  'submittedAt',
]

export function selectPersonDirectoryFields(query) {
  return query.select(...PERSON_DIRECTORY_FIELDS)
}

function getPersonSampleCount(data) {
  if (Number.isFinite(data.sampleCount)) return Number(data.sampleCount)
  if (Number.isFinite(data.biometricSampleCount)) return Number(data.biometricSampleCount)
  return normalizeStoredDescriptors(data.descriptors).length
}

export function parseDirectoryParams(request) {
  const searchParams = new URL(request.url).searchParams
  const query = String(searchParams.get('q') || '').trim()
  const searchMode = inferPersonDirectorySearchMode(query)

  return {
    officeId: String(searchParams.get('officeId') || '').trim(),
    status: String(searchParams.get('status') || 'all').trim().toLowerCase(),
    approval: String(searchParams.get('approval') || 'all').trim().toLowerCase(),
    limit: clampPersonDirectoryLimit(searchParams.get('limit')),
    query,
    searchMode,
    searchValue: normalizePersonDirectorySearchValue(query, searchMode),
    cursor: decodePersonDirectoryCursor(searchParams.get('cursor')),
  }
}

export function mapPersonRecord(record) {
  const data = record.data()
  const hasPhoto = Boolean(data.photoPath || data.photoUrl)

  return {
    id: record.id,
    name: data.name || '',
    employeeId: data.employeeId || '',
    position: data.position || '',
    nameLower: data.nameLower || String(data.name || '').toLowerCase(),
    officeId: data.officeId || '',
    officeName: data.officeName || 'Unassigned',
    divisionId: data.divisionId || '',
    divisionName: data.divisionName || '',
    active: data.active !== false,
    approvalStatus: getEffectivePersonApprovalStatus(data),
    sampleCount: getPersonSampleCount(data),
    duplicateReviewRequired: data.duplicateReviewRequired === true || ['required', 'review_required'].includes(data.duplicateReviewStatus),
    duplicateReviewStatus: String(data.duplicateReviewStatus || 'clear'),
    duplicateReviewCandidateName: String(data.duplicateReviewCandidateName || ''),
    duplicateReviewCandidateEmployeeId: String(data.duplicateReviewCandidateEmployeeId || ''),
    duplicateReviewDistance: Number.isFinite(data.duplicateReviewDistance) ? Number(data.duplicateReviewDistance) : null,
    duplicateReviewReasonCode: String(data.duplicateReviewReasonCode || ''),
    photoUrl: hasPhoto ? `/api/persons/${record.id}/photo` : null,
    hasPhoto,
    submittedAt: data.submittedAt || null,
  }
}

export function buildDirectoryQuery(db, resolvedSession, params) {
  const scopedOfficeId = resolvedSession.scope === 'office'
    ? resolvedSession.officeId
    : params.officeId

  let query = db.collection('persons')

  if (scopedOfficeId) query = query.where('officeId', '==', scopedOfficeId)
  if (params.status === 'active') query = query.where('active', '==', true)
  else if (params.status === 'inactive') query = query.where('active', '==', false)

  if (params.approval === 'pending' || params.approval === 'rejected') {
    query = query.where('approvalStatus', '==', params.approval)
  }

  const [primaryField, secondaryField] = getPersonDirectorySortFields(params.searchMode)

  if (params.searchValue) {
    query = query
      .where(primaryField, '>=', params.searchValue)
      .where(primaryField, '<=', `${params.searchValue}\uf8ff`)
  }

  return {
    query: query.orderBy(primaryField, 'asc').orderBy(secondaryField, 'asc'),
    primaryField,
    secondaryField,
  }
}

export async function countDirectoryRecords(db, resolvedSession, params) {
  const { query } = buildDirectoryQuery(db, resolvedSession, params)
  const snapshot = await query.count().get()
  return Number(snapshot.data().count || 0)
}

export async function loadDirectoryPage(db, resolvedSession, params) {
  const { query, primaryField, secondaryField } = buildDirectoryQuery(db, resolvedSession, params)
  const directoryQuery = selectPersonDirectoryFields(query)

  if (params.approval !== 'approved') {
    let pageQuery = directoryQuery.limit(params.limit + 1)
    if (params.cursor) {
      pageQuery = pageQuery.startAfter(params.cursor.primary, params.cursor.secondary)
    }
    const snapshot = await pageQuery.get()
    return {
      docs: snapshot.docs.slice(0, params.limit),
      hasMore: snapshot.docs.length > params.limit,
      primaryField,
      secondaryField,
    }
  }

  const collected = []
  const batchSize = Math.max(params.limit * 3, params.limit + 1, 12)
  let hasMore = false
  let scanQuery = directoryQuery

  if (params.cursor) {
    scanQuery = scanQuery.startAfter(params.cursor.primary, params.cursor.secondary)
  }

  while (collected.length < params.limit + 1) {
    const snapshot = await scanQuery.limit(batchSize).get()
    if (snapshot.empty) break

    snapshot.docs.forEach(record => {
      if (getEffectivePersonApprovalStatus(record.data()) === params.approval) {
        collected.push(record)
      }
    })

    if (collected.length > params.limit) { hasMore = true; break }
    if (snapshot.size < batchSize) break

    const lastRecord = snapshot.docs[snapshot.docs.length - 1]
    scanQuery = directoryQuery.startAfter(lastRecord.get(primaryField), lastRecord.get(secondaryField))
  }

  return {
    docs: collected.slice(0, params.limit),
    hasMore,
    primaryField,
    secondaryField,
  }
}
