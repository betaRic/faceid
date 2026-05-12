function parseJsonCandidate(value) {
  try {
    const parsed = JSON.parse(value)
    if (typeof parsed === 'string') return parseJsonCandidate(parsed)
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

function buildServiceAccountCandidates(raw) {
  const trimmed = String(raw || '').trim()
  if (!trimmed) return []

  const candidates = [trimmed]
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"'))
    || (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    candidates.push(trimmed.slice(1, -1).trim())
  }

  // Some env consoles and local shells store the JSON object with escaped
  // property quotes but without wrapping it as a JSON string:
  // {\"type\":\"service_account\",...}
  if (trimmed.includes('\\"')) {
    candidates.push(trimmed.replace(/\\"/g, '"'))
  }

  return Array.from(new Set(candidates.filter(Boolean)))
}

export function parseFirebaseServiceAccount(raw) {
  for (const candidate of buildServiceAccountCandidates(raw)) {
    const parsed = parseJsonCandidate(candidate)
    if (!parsed?.project_id || !parsed?.private_key || !parsed?.client_email) {
      continue
    }

    return {
      ...parsed,
      private_key: String(parsed.private_key || '').replace(/\\n/g, '\n'),
    }
  }

  return null
}

export function readFirebaseServiceAccountFromEnv(env = process.env) {
  return parseFirebaseServiceAccount(env.FIREBASE_SERVICE_ACCOUNT_JSON)
}
