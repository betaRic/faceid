import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const scanRoots = ['app/api', 'lib/routes', 'lib/attendance']
const sourceExtensions = new Set(['.js', '.mjs', '.cjs', '.ts', '.tsx'])
const forbiddenResponseFields = [
  /(?:message|error|detail|reason)\s*:\s*error\s+instanceof\s+Error\s*\?\s*error\.message/,
  /(?:message|error|detail|reason)\s*:\s*err\s+instanceof\s+Error\s*\?\s*err\.message/,
  /(?:message|error|detail|reason)\s*:\s*error\?\.message/,
  /(?:message|error|detail|reason)\s*:\s*err\?\.message/,
  /(?:message|error|detail|reason)\s*:\s*error\.message/,
]

async function listSourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = await Promise.all(entries.map(async entry => {
    const entryPath = path.join(directory, entry.name)
    if (entry.isDirectory()) return listSourceFiles(entryPath)
    return sourceExtensions.has(path.extname(entry.name)) ? [entryPath] : []
  }))
  return files.flat().sort()
}

function findSourceViolations(file, source, patterns) {
  const relativeFile = path.relative(projectRoot, file).replaceAll('\\', '/')
  const matches = []
  for (const pattern of patterns) {
    const matcher = new RegExp(pattern.source, `${pattern.flags.replaceAll('g', '')}g`)
    for (const match of source.matchAll(matcher)) {
      const index = match.index ?? 0
      const lineNumber = source.slice(0, index).split(/\r?\n/).length
      matches.push({
        index,
        violation: `${relativeFile}:${lineNumber}: ${match[0].replace(/\s+/g, ' ').trim()}`,
      })
    }
  }
  return matches
    .sort((left, right) => left.index - right.index)
    .map(match => match.violation)
}

test('API response-like fields never expose caught error messages', async () => {
  const files = (await Promise.all(
    scanRoots.map(root => listSourceFiles(path.join(projectRoot, root))),
  )).flat().sort()
  const violations = []
  for (const file of files) {
    const source = await readFile(file, 'utf8')
    violations.push(...findSourceViolations(file, source, forbiddenResponseFields))
  }

  assert.deepEqual(
    violations,
    [],
    `Found ${violations.length} raw caught-error response field(s):\n${violations.join('\n')}`,
  )
})

test('attendance embedding catches do not return intermediate native error messages', async () => {
  const file = path.join(projectRoot, 'lib/attendance/process.js')
  const source = await readFile(file, 'utf8')
  const violations = findSourceViolations(file, source, [
    /const\s+message\s*=\s*error\?\.message/,
    /const\s+message\s*=\s*fallbackError\?\.message(?:\s*\|\|\s*error\?\.message)?/,
  ])

  assert.deepEqual(
    violations,
    [],
    `Attendance catches copy ${violations.length} native error message(s) into scan responses:\n${violations.join('\n')}`,
  )
})
