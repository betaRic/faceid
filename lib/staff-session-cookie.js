export function staffSessionCookieOptions({ maxAge }) {
  if (!Number.isSafeInteger(maxAge) || maxAge < 0) {
    throw new TypeError('Staff session cookie maxAge must be a non-negative integer.')
  }

  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge,
  }
}
