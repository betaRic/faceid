import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { extname, join } from 'node:path'
import { describe, expect, it } from 'vitest'

function sourceFiles(root) {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name)
    return entry.isDirectory() ? sourceFiles(path) : ['.js', '.jsx'].includes(extname(path)) ? [path] : []
  })
}

function activeSourceFiles() {
  return [
    ...sourceFiles('app'),
    ...sourceFiles('components'),
    ...sourceFiles('hooks'),
    ...sourceFiles('lib'),
    '.env.example',
    'README.md',
  ].filter(existsSync)
}

function isAllowedDisabledBiometricSwitch(path, line) {
  const normalizedPath = path.replaceAll('\\', '/')
  if (!['lib/biometrics/human.js', 'lib/biometrics/server-embedding-core.js'].includes(normalizedPath)) return false
  return /^\s*(?:iris|liveness):\s*\{\s*enabled:\s*false\s*\},?\s*$/u.test(line)
}

function isAllowedLegacyDecisionMapping(path, line) {
  if (path.replaceAll('\\', '/') !== 'lib/maintenance/event-evidence.js') return false
  return /^\s*\['blocked_(?:missing_)?liveness',\s*'other_biometric_failure'\],?\s*$/u.test(line)
}

describe('UI source hygiene', () => {
  it('does not use text glyphs as functional icons', () => {
    const failures = [...sourceFiles('app'), ...sourceFiles('components')]
      .filter((path) => /[✕›‹]/u.test(readFileSync(path, 'utf8')))
    expect(failures).toEqual([])
  })

  it('does not restore decorative kiosk scanner layers', () => {
    const failures = [...sourceFiles('app'), ...sourceFiles('components')]
      .filter((path) => /scan-visual__(grid|sweep|corner)/u.test(readFileSync(path, 'utf8')))
    expect(failures).toEqual([])
  })

  it('keeps browser liveness and iris disabled without active dependencies or guidance', () => {
    for (const path of ['lib/biometrics/human.js', 'lib/biometrics/server-embedding-core.js']) {
      const source = readFileSync(path, 'utf8')
      expect(source).toMatch(/^\s*liveness:\s*\{\s*enabled:\s*false\s*\},?\s*$/mu)
      expect(source).toMatch(/^\s*iris:\s*\{\s*enabled:\s*false\s*\},?\s*$/mu)
    }

    const failures = activeSourceFiles().flatMap((path) => (
      readFileSync(path, 'utf8')
        .split(/\r?\n/u)
        .map((line, index) => ({ path, line, lineNumber: index + 1 }))
        .filter(({ line }) => /(?:liveness|iris)/iu.test(line))
        .filter(({ path: sourcePath, line }) => (
          !isAllowedDisabledBiometricSwitch(sourcePath, line)
          && !isAllowedLegacyDecisionMapping(sourcePath, line)
        ))
        .map(({ line, lineNumber }) => `${path}:${lineNumber}:${line.trim()}`)
    ))

    expect(failures).toEqual([])
  })
})
