import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('semantic design tokens', () => {
  it('defines the civic palette and reduced motion', () => {
    const css = readFileSync('app/globals.css', 'utf8')
    expect(css).toContain('--color-primary: #032d57')
    expect(css).toContain('--color-accent: #ea921f')
    expect(css).toContain('@media (prefers-reduced-motion: reduce)')
  })
})
