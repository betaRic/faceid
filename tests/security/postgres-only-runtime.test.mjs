import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const runtimeRoots = ['app', 'components', 'hooks', 'lib']
const removedRuntimePaths = [
  'lib/persons/enrollment.js',
  'lib/person-biometrics.js',
  'lib/storage.js',
  'app/api/cron/warm-biometric-cache/route.js',
  'app/api/debug/attendance-failures/route.js',
  'app/api/debug/latest-fail/route.js',
  'app/api/debug/match-test/route.js',
  'app/api/admin/debug-biometric/route.js',
  'app/api/admin/maintenance/scan-events/route.js',
  'app/api/biometric/embed/route.js',
]

async function collectSourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = []

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      files.push(...await collectSourceFiles(entryPath))
    } else if (/\.(?:js|jsx|mjs|cjs|ts|tsx)$/.test(entry.name)) {
      files.push(entryPath)
    }
  }

  return files
}

test('runtime is PostgreSQL-only and excludes the retired Firestore biometric tree', async () => {
  for (const relativePath of removedRuntimePaths) {
    assert.equal(
      existsSync(path.join(projectRoot, relativePath)),
      false,
      `${relativePath} must not exist`,
    )
  }

  const runtimeFiles = (await Promise.all(
    runtimeRoots.map(root => collectSourceFiles(path.join(projectRoot, root))),
  )).flat()

  for (const filePath of runtimeFiles) {
    const source = await readFile(filePath, 'utf8')
    const relativePath = path.relative(projectRoot, filePath)
    assert.doesNotMatch(source, /\bdb\s*\.\s*collection\s*\(/, `${relativePath} contains Firestore access`)
    assert.doesNotMatch(source, /NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET/, `${relativePath} contains Firebase storage configuration`)
    assert.doesNotMatch(source, /(?:from\s+|import\s*\()\s*['"][^'"]*firebase[^'"]*['"]/, `${relativePath} imports Firebase`)
  }

  const personsIndex = await readFile(path.join(projectRoot, 'lib', 'persons', 'index.js'), 'utf8')
  assert.doesNotMatch(personsIndex, /from\s+['"]\.\/enrollment['"]/, 'persons index must not export retired Firestore enrollment')

  const [attendanceMatch, personStore] = await Promise.all([
    readFile(path.join(projectRoot, 'lib', 'attendance', 'match.js'), 'utf8'),
    readFile(path.join(projectRoot, 'lib', 'postgres', 'person-store.js'), 'utf8'),
  ])
  assert.match(attendanceMatch, /from ['"]@\/lib\/biometric-math['"]/)
  assert.match(attendanceMatch, /matchBiometricIndex(?:Candidates|MultiDescriptor)/)
  assert.match(personStore, /buildDescriptorBuckets/)
  assert.match(personStore, /from ['"]@\/lib\/biometric-math['"]/)
})

test('environment templates inventory release-critical runtime and isolated test variables', async () => {
  const [runtimeTemplate, testTemplate] = await Promise.all([
    readFile(path.join(projectRoot, '.env.example'), 'utf8'),
    readFile(path.join(projectRoot, '.env.test.example'), 'utf8'),
  ])

  for (const variable of [
    'DATA_BACKEND',
    'DATABASE_URL',
    'ADMIN_SESSION_SECRET',
    'HR_SESSION_SECRET',
    'EMPLOYEE_VIEW_SESSION_SECRET',
    'LOGIN_RATE_LIMIT_SECRET',
    'CRON_SECRET',
    'NEXT_PUBLIC_SITE_URL',
    'TRUST_SMARTASP_PROXY',
    'LOCAL_FILE_STORAGE_DIR',
    'SERVER_ATTENDANCE_PAD_ENABLED',
  ]) {
    assert.match(runtimeTemplate, new RegExp(`^${variable}=`, 'm'), `${variable} missing from .env.example`)
  }

  for (const variable of ['FACEID_TEST_DATABASE_URL', 'FACEID_TEST_PG_BIN', 'FACEID_TEST_PG_DATA']) {
    assert.match(testTemplate, new RegExp(`^${variable}=`, 'm'), `${variable} missing from .env.test.example`)
  }
})
