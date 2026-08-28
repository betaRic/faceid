import { readdirSync, readFileSync } from 'node:fs'
import { extname, join } from 'node:path'
import { describe, expect, it } from 'vitest'

function sourceFiles(root) {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name)
    return entry.isDirectory() ? sourceFiles(path) : ['.js', '.jsx'].includes(extname(path)) ? [path] : []
  })
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
})
