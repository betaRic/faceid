import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

function launch(files) {
  const root = mkdtempSync(path.join(tmpdir(), 'faceid-hosting-'))
  try {
    writeFileSync(path.join(root, 'package.json'), '{"type":"module"}')
    writeFileSync(path.join(root, 'app.js'), readFileSync(new URL('../app.js', import.meta.url)))
    mkdirSync(path.join(root, 'node_modules/next'), { recursive: true })
    writeFileSync(path.join(root, 'node_modules/next/package.json'), '{"type":"module","exports":"./index.js"}')
    writeFileSync(path.join(root, 'node_modules/next/index.js'), `
      import { fileURLToPath } from 'node:url'
      import path from 'node:path'
      console.log('NEXT_IMPORTED:' + process.env.NODE_ENV + ':' + process.env.PORT)
      export default function next(options) {
        console.log('ROOT_OK:' + (options.dir === path.resolve(fileURLToPath(new URL('../../', import.meta.url)))))
        console.log('CWD_OK:' + (process.cwd() === options.dir))
        throw new Error('TEST_NEXT_REACHED')
      }
    `)
    for (const file of files) writeFileSync(path.join(root, file), 'DATABASE_URL=unused-test-value')
    return spawnSync(process.execPath, [path.join(root, 'app.js')], {
      cwd: tmpdir(), env: { ...process.env, NODE_ENV: 'development', PORT: '43210' }, encoding: 'utf8',
    })
  } finally {
    assert.equal(path.dirname(root), path.resolve(tmpdir()))
    assert.ok(path.basename(root).startsWith('faceid-hosting-'))
    rmSync(root, { recursive: true, force: true })
  }
}

test('production requires the site root .env before importing Next', () => {
  const result = launch([])
  assert.match(result.stderr, /Live \.env is required/)
  assert.doesNotMatch(result.stdout, /NEXT_IMPORTED/)
})

for (const file of ['.env.local', '.env.production', '.env.production.local']) {
  test(`production refuses ${file} before importing Next`, () => {
    const result = launch(['.env', file])
    assert.match(result.stderr, /Competing production settings file/)
    assert.doesNotMatch(result.stdout, /NEXT_IMPORTED/)
  })
}

test('forces production mode while preserving the hosting port', () => {
  const result = launch(['.env', '.env.development.local'])
  assert.match(result.stdout, /NEXT_IMPORTED:production:43210/)
  assert.match(result.stdout, /ROOT_OK:true/)
  assert.match(result.stdout, /CWD_OK:true/)
  assert.match(result.stderr, /TEST_NEXT_REACHED/)
})
