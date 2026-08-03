export function normalizePersonNamePart(value) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('en-US')
    .replace(/(^|[\s,'-])([a-z])/g, (_, prefix, character) => `${prefix}${character.toUpperCase()}`)
}

export function buildEmployeeDisplayName({ lastName = '', firstName = '', middleName = '' } = {}) {
  const last = normalizePersonNamePart(lastName)
  const first = normalizePersonNamePart(firstName)
  const middle = normalizePersonNamePart(middleName)

  if (last && first) return `${last}, ${[first, middle].filter(Boolean).join(' ')}`.trim()
  if (first || middle || last) return [first, middle, last].filter(Boolean).join(' ')
  return ''
}

export function normalizeEmployeeNameFields(input = {}) {
  const lastName = normalizePersonNamePart(input.lastName)
  const firstName = normalizePersonNamePart(input.firstName)
  const middleName = normalizePersonNamePart(input.middleName)
  const name = buildEmployeeDisplayName({
    lastName,
    firstName,
    middleName,
  })

  return {
    lastName,
    firstName,
    middleName,
    name,
    nameLower: name.toLowerCase(),
  }
}
