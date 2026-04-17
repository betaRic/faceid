import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

function parseEnvValue(rawValue) {
  const trimmed = String(rawValue || '').trim()
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"'))
    || (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1)
  }
  return trimmed
}

export function loadRepoEnv(options = {}) {
  const cwd = options.cwd || process.cwd()
  const files = Array.isArray(options.files) && options.files.length > 0
    ? options.files
    : ['.env', '.env.local']
  const protectedKeys = new Set(Object.keys(process.env))
  const loadedFiles = []

  for (const fileName of files) {
    const filePath = path.join(cwd, fileName)
    if (!existsSync(filePath)) continue

    const lines = readFileSync(filePath, 'utf8').split(/\r?\n/)
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue

      const separatorIndex = trimmed.indexOf('=')
      const key = trimmed.slice(0, separatorIndex).trim()
      const value = parseEnvValue(trimmed.slice(separatorIndex + 1))
      if (!key || protectedKeys.has(key)) continue
      process.env[key] = value
    }

    loadedFiles.push(fileName)
  }

  return { cwd, loadedFiles }
}
