import { readdir } from 'node:fs/promises'
import path from 'node:path'

export async function discoverRouteTestFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  return entries
    .filter(entry => entry.isFile() && entry.name.endsWith('.routes.test.mjs'))
    .map(entry => path.join(directory, entry.name))
    .sort()
}

export function requireRouteTestFiles(files) {
  if (files.length === 0) {
    throw new Error('No PostgreSQL route tests found.')
  }
  return files
}
