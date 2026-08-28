import {
  clampPersonDirectoryLimit,
  decodePersonDirectoryCursor,
  inferPersonDirectorySearchMode,
  normalizePersonDirectorySearchValue,
} from '@/lib/person-directory'

export function parseDirectoryParams(request) {
  const searchParams = new URL(request.url).searchParams
  const query = String(searchParams.get('q') || '').trim()
  const searchMode = inferPersonDirectorySearchMode(query)

  return {
    officeId: String(searchParams.get('officeId') || '').trim(),
    divisionId: String(searchParams.get('divisionId') || '').trim(),
    status: String(searchParams.get('status') || 'all').trim().toLowerCase(),
    approval: String(searchParams.get('approval') || 'all').trim().toLowerCase(),
    limit: clampPersonDirectoryLimit(searchParams.get('limit')),
    query,
    searchMode,
    searchValue: normalizePersonDirectorySearchValue(query, searchMode),
    cursor: decodePersonDirectoryCursor(searchParams.get('cursor')),
  }
}
