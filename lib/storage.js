import 'server-only'

export function getEnrollmentPhotoPath(personId) {
  return `photos/enrollments/${personId}.jpg`
}

export async function uploadEnrollmentPhoto() {
  throw new Error('Remote photo storage has been removed. Use local enrollment photo storage.')
}

export async function readEnrollmentPhoto() {
  return null
}

export async function deleteEnrollmentPhoto() {
  return false
}
