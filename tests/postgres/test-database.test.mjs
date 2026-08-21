import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { assertSafeTestDatabaseUrl, canonicalDataDirectory, migrateTestDatabase } from './test-database.mjs'
import { sameOriginRequest } from './route-request.mjs'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

test('accepts only loopback faceid_rc databases', () => {
  const url = assertSafeTestDatabaseUrl('postgres://postgres@127.0.0.1:55432/faceid_rc_local')
  assert.equal(url.hostname, '127.0.0.1')
  assert.equal(url.pathname, '/faceid_rc_local')
})

test('does not fall back to DATABASE_URL', () => {
  const originalTestUrl = process.env.FACEID_TEST_DATABASE_URL
  const originalDatabaseUrl = process.env.DATABASE_URL
  try {
    delete process.env.FACEID_TEST_DATABASE_URL
    process.env.DATABASE_URL = 'postgres://user@production.example/faceid_rc_production'
    assert.throws(() => assertSafeTestDatabaseUrl(), /FACEID_TEST_DATABASE_URL/)
  } finally {
    if (originalTestUrl === undefined) delete process.env.FACEID_TEST_DATABASE_URL
    else process.env.FACEID_TEST_DATABASE_URL = originalTestUrl
    if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL
    else process.env.DATABASE_URL = originalDatabaseUrl
  }
})

test('postgres test command requires FACEID_TEST_DATABASE_URL', () => {
  const env = { ...process.env }
  delete env.FACEID_TEST_DATABASE_URL
  const result = spawnSync(process.execPath, ['scripts/postgres-test.mjs', 'verify'], {
    cwd: projectRoot,
    env,
    encoding: 'utf8',
    shell: false,
  })

  assert.notEqual(result.status, 0)
  assert.match(`${result.stdout}\n${result.stderr}`, /FACEID_TEST_DATABASE_URL/)
})

test('postgres test command defaults to verify without cluster access', async () => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'faceattend-postgres-default-'))
  try {
    const result = spawnSync(process.execPath, ['scripts/postgres-test.mjs'], {
      cwd: projectRoot,
      env: {
        ...process.env,
        FACEID_TEST_DATABASE_URL: 'postgres://postgres@127.0.0.1:55432/faceid_rc_local',
        FACEID_TEST_PG_DATA: dataDir,
      },
      encoding: 'utf8',
      shell: false,
    })

    assert.equal(result.status, 0, result.stderr)
    assert.match(result.stdout, /FACEID_TEST_DATABASE_URL verified/)
  } finally {
    await rm(dataDir, { recursive: true, force: true })
  }
})

test('postgres test command rejects removed status command', () => {
  const result = spawnSync(process.execPath, ['scripts/postgres-test.mjs', 'status'], {
    cwd: projectRoot,
    env: {
      ...process.env,
      FACEID_TEST_DATABASE_URL: 'postgres://postgres@127.0.0.1:55432/faceid_rc_local',
    },
    encoding: 'utf8',
    shell: false,
  })

  assert.notEqual(result.status, 0)
  assert.match(`${result.stdout}\n${result.stderr}`, /verify\|init\|start\|stop\|reset/)
})

test('postgres test command requires an IPv4 loopback URL for its IPv4-only cluster', () => {
  const result = spawnSync(process.execPath, ['scripts/postgres-test.mjs', 'verify'], {
    cwd: projectRoot,
    env: {
      ...process.env,
      FACEID_TEST_DATABASE_URL: 'postgres://postgres@[::1]:55432/faceid_rc_local',
    },
    encoding: 'utf8',
    shell: false,
  })

  assert.notEqual(result.status, 0)
  assert.match(`${result.stdout}\n${result.stderr}`, /127\.0\.0\.1/)
})

test('alternate absolute data path remains marker-guarded for mutating commands', async () => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'faceattend-postgres-alt-'))
  try {
    const result = spawnSync(process.execPath, ['scripts/postgres-test.mjs', 'reset'], {
      cwd: projectRoot,
      env: {
        ...process.env,
        FACEID_TEST_DATABASE_URL: 'postgres://postgres@127.0.0.1:55432/faceid_rc_local',
        FACEID_TEST_PG_DATA: dataDir,
      },
      encoding: 'utf8',
      shell: false,
    })

    assert.notEqual(result.status, 0)
    assert.match(`${result.stdout}\n${result.stderr}`, /test-owned PostgreSQL 18 cluster/)
  } finally {
    await rm(dataDir, { recursive: true, force: true })
  }
})

test('postgres init allows an existing empty data directory', async () => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'faceattend-postgres-existing-'))
  try {
    const result = spawnSync(process.execPath, ['scripts/postgres-test.mjs', 'init'], {
      cwd: projectRoot,
      env: {
        ...process.env,
        FACEID_TEST_DATABASE_URL: 'postgres://postgres@127.0.0.1:55432/faceid_rc_local',
        FACEID_TEST_PG_DATA: dataDir,
        FACEID_TEST_PG_BIN: path.join(dataDir, 'missing-bin'),
      },
      encoding: 'utf8',
      shell: false,
    })

    assert.notEqual(result.status, 0)
    assert.doesNotMatch(`${result.stdout}\n${result.stderr}`, /must not already exist before init/)
    assert.match(`${result.stdout}\n${result.stderr}`, /ENOENT/)
  } finally {
    await rm(dataDir, { recursive: true, force: true })
  }
})

test('postgres init refuses a nonempty unmarked data directory', async () => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'faceattend-postgres-nonempty-'))
  try {
    await writeFile(path.join(dataDir, 'unknown.txt'), 'do not adopt')
    const result = spawnSync(process.execPath, ['scripts/postgres-test.mjs', 'init'], {
      cwd: projectRoot,
      env: {
        ...process.env,
        FACEID_TEST_DATABASE_URL: 'postgres://postgres@127.0.0.1:55432/faceid_rc_local',
        FACEID_TEST_PG_DATA: dataDir,
        FACEID_TEST_PG_BIN: path.join(dataDir, 'missing-bin'),
      },
      encoding: 'utf8',
      shell: false,
    })

    assert.notEqual(result.status, 0)
    assert.match(`${result.stdout}\n${result.stderr}`, /must not already exist before init/)
  } finally {
    await rm(dataDir, { recursive: true, force: true })
  }
})

test('alternate absolute data path is accepted for portable test clusters', async () => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'faceattend-postgres-config-'))
  try {
    const result = spawnSync(process.execPath, [
      '--input-type=module',
      '--eval',
      "import { getSafeTestClusterConfig } from './tests/postgres/test-cluster.mjs'; console.log(getSafeTestClusterConfig().dataDir)",
    ], {
      cwd: projectRoot,
      env: {
        ...process.env,
        FACEID_TEST_DATABASE_URL: 'postgres://postgres@127.0.0.1:55432/faceid_rc_local',
        FACEID_TEST_PG_DATA: dataDir,
      },
      encoding: 'utf8',
      shell: false,
    })

    assert.equal(result.status, 0, result.stderr)
    assert.equal(result.stdout.trim(), path.resolve(dataDir))
  } finally {
    await rm(dataDir, { recursive: true, force: true })
  }
})

test('test-cluster configuration rejects empty and relative data paths', () => {
  for (const dataDir of ['', 'relative-test-data']) {
    const result = spawnSync(process.execPath, [
      '--input-type=module',
      '--eval',
      "import { getSafeTestClusterConfig } from './tests/postgres/test-cluster.mjs'; getSafeTestClusterConfig()",
    ], {
      cwd: projectRoot,
      env: {
        ...process.env,
        FACEID_TEST_DATABASE_URL: 'postgres://postgres@127.0.0.1:55432/faceid_rc_local',
        FACEID_TEST_PG_DATA: dataDir,
      },
      encoding: 'utf8',
      shell: false,
    })

    assert.notEqual(result.status, 0)
    assert.match(`${result.stdout}\n${result.stderr}`, /FACEID_TEST_PG_DATA must be a non-empty absolute path/)
  }
})

test('route runner uses Node experimental loader spelling', async () => {
  const source = await readFile(path.join(projectRoot, 'tests', 'postgres', 'run-route-tests.mjs'), 'utf8')
  assert.match(source, /--experimental-loader/)
})

test('route test discovery is isolated from repository route files', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'faceattend-route-discovery-'))
  try {
    const emptyDirectory = path.join(directory, 'empty')
    await mkdir(emptyDirectory)
    await writeFile(path.join(directory, 'future.routes.test.mjs'), '')
    await writeFile(path.join(directory, 'ignored.test.mjs'), '')
    const { discoverRouteTestFiles, requireRouteTestFiles } = await import('./route-test-files.mjs')

    const files = await discoverRouteTestFiles(directory)
    assert.deepEqual(files, [path.join(directory, 'future.routes.test.mjs')])
    const emptyFiles = await discoverRouteTestFiles(emptyDirectory)
    assert.deepEqual(emptyFiles, [])
    assert.throws(() => requireRouteTestFiles(emptyFiles), /No PostgreSQL route tests found/)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('route runtime storage is unique, contained, and removed exactly', async () => {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'faceattend-route-runtime-project-'))
  try {
    const { createRouteRuntimeDir, removeRouteRuntimeDir } = await import('./route-runtime.mjs')
    const runtimeDir = await createRouteRuntimeDir(projectRoot)
    const secondRuntimeDir = await createRouteRuntimeDir(projectRoot)
    const runtimeRoot = path.join(projectRoot, '.faceattend-test-runtime')

    assert.notEqual(runtimeDir, secondRuntimeDir)
    assert.equal(path.relative(runtimeRoot, runtimeDir).startsWith('..'), false)
    assert.equal((await stat(runtimeDir)).isDirectory(), true)
    await removeRouteRuntimeDir(projectRoot, runtimeDir)
    await removeRouteRuntimeDir(projectRoot, secondRuntimeDir)
    await assert.rejects(stat(runtimeDir), /ENOENT/)
    await assert.rejects(
      removeRouteRuntimeDir(projectRoot, path.join(projectRoot, 'outside-runtime')),
      /must stay inside the route test runtime root/,
    )
  } finally {
    await rm(projectRoot, { recursive: true, force: true })
  }
})

test('migrations reject mismatched server identity before destructive SQL', async () => {
  const queries = []
  const client = {
    async connect() {},
    async end() {},
    async query(sql) {
      queries.push(sql)
      return {
        rowCount: 1,
        rows: [{
          data_directory: path.join(os.tmpdir(), 'different-postgres-data'),
          server_version_num: '180006',
          server_addr: '127.0.0.1',
          server_port: 55432,
        }],
      }
    },
  }

  await assert.rejects(
    migrateTestDatabase({
      databaseUrl: 'postgres://postgres@127.0.0.1:55432/faceid_rc_mismatch',
      expectedDataDir: path.join(os.tmpdir(), 'expected-postgres-data'),
      createClient: () => client,
    }),
    /data directory does not match FACEID_TEST_PG_DATA/,
  )
  assert.equal(queries.some(sql => /CREATE DATABASE|DROP SCHEMA/i.test(sql)), false)
})

test('canonical PostgreSQL data directories preserve case on case-sensitive platforms', () => {
  assert.notEqual(
    canonicalDataDirectory('/tmp/OwnedPostgres', 'linux'),
    canonicalDataDirectory('/tmp/ownedpostgres', 'linux'),
  )
  assert.equal(
    canonicalDataDirectory('D:\\OwnedPostgres', 'win32'),
    canonicalDataDirectory('d:\\ownedpostgres', 'win32'),
  )
})

test('migrations reject a target connection that does not match the owned server before DROP SCHEMA', async () => {
  const expectedDataDir = path.join(os.tmpdir(), 'expected-postgres-data')
  const queries = []
  const admin = {
    async connect() {},
    async end() {},
    async query(sql) {
      queries.push(`admin:${sql}`)
      if (/data_directory/i.test(sql)) {
        return {
          rowCount: 1,
          rows: [{
            data_directory: expectedDataDir,
            server_version_num: '180006',
            server_addr: '127.0.0.1/32',
            server_port: 55432,
          }],
        }
      }
      return { rowCount: 1, rows: [] }
    },
  }
  const target = {
    async connect() {},
    async end() {},
    async query(sql) {
      queries.push(`target:${sql}`)
      return {
        rowCount: 1,
        rows: [{
          data_directory: path.join(os.tmpdir(), 'different-postgres-data'),
          server_version_num: '180006',
          server_addr: '127.0.0.1/32',
          server_port: 55432,
        }],
      }
    },
  }
  const clients = [admin, target]

  await assert.rejects(
    migrateTestDatabase({
      databaseUrl: 'postgres://postgres@127.0.0.1:55432/faceid_rc_mismatch',
      expectedDataDir,
      createClient: () => clients.shift(),
    }),
    /data directory does not match FACEID_TEST_PG_DATA/,
  )
  assert.equal(queries.some(sql => /target:.*DROP SCHEMA/i.test(sql)), false)
})

test('migrations keep validated admin connection open through target schema reset', async () => {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'faceattend-migration-project-'))
  const expectedDataDir = path.join(os.tmpdir(), 'owned-postgres-data')
  const events = []
  const admin = {
    async connect() { events.push('admin-connect') },
    async end() { events.push('admin-end') },
    async query(sql) {
      events.push(`admin:${sql.trim().slice(0, 16)}`)
      if (/data_directory/i.test(sql)) {
        return {
          rowCount: 1,
          rows: [{
            data_directory: expectedDataDir,
            server_version_num: '180006',
            server_addr: '127.0.0.1/32',
            server_port: 55432,
          }],
        }
      }
      return { rowCount: 1, rows: [] }
    },
  }
  const target = {
    async connect() { events.push('target-connect') },
    async end() { events.push('target-end') },
    async query(sql) {
      events.push(`target:${sql.trim().slice(0, 16)}`)
      if (/data_directory/i.test(sql)) {
        return {
          rowCount: 1,
          rows: [{
            data_directory: expectedDataDir,
            server_version_num: '180006',
            server_addr: '127.0.0.1/32',
            server_port: 55432,
          }],
        }
      }
      return { rowCount: 1, rows: [] }
    },
  }
  const clients = [admin, target]
  try {
    await mkdir(path.join(projectRoot, 'db', 'migrations'), { recursive: true })
    await migrateTestDatabase({
      projectRoot,
      databaseUrl: 'postgres://postgres@127.0.0.1:55432/faceid_rc_owned',
      expectedDataDir,
      createClient: () => clients.shift(),
    })

    assert.ok(events.indexOf('admin-end') > events.findIndex(event => event.startsWith('target:DROP SCHEMA')))
  } finally {
    await rm(projectRoot, { recursive: true, force: true })
  }
})

test('sameOriginRequest keeps an explicit origin for CSRF rejection tests', () => {
  const request = sameOriginRequest('/api/example', {
    headers: { origin: 'https://untrusted.example' },
  })

  assert.equal(request.headers.get('origin'), 'https://untrusted.example')
})

test('route loader resolves extensionless local imports below an alias import', () => {
  const loaderUrl = pathToFileURL(path.join(projectRoot, 'tests', 'postgres', 'route-loader.mjs')).href
  const result = spawnSync(process.execPath, [
    '--loader', loaderUrl,
    '--input-type=module',
    '--eval',
    "await import('@/app/api/system/status/route.js')",
  ], {
    cwd: projectRoot,
    env: {
      ...process.env,
      DATABASE_URL: 'postgres://postgres@127.0.0.1:55432/faceid_rc_local',
      DATA_BACKEND: 'postgres',
    },
    encoding: 'utf8',
    shell: false,
  })

  assert.equal(result.status, 0, result.stderr)
})

test('route test runner requires the controller IPv4 test-cluster URL', () => {
  const result = spawnSync(process.execPath, ['tests/postgres/run-route-tests.mjs'], {
    cwd: projectRoot,
    env: {
      ...process.env,
      FACEID_TEST_DATABASE_URL: 'postgres://postgres@[::1]:55432/faceid_rc_local',
    },
    encoding: 'utf8',
    shell: false,
  })

  assert.notEqual(result.status, 0)
  assert.match(`${result.stdout}\n${result.stderr}`, /127\.0\.0\.1/)
})

test('test-cluster configuration applies port 55432 when the URL omits a port', () => {
  const result = spawnSync(process.execPath, [
    '--input-type=module',
    '--eval',
    "import { getSafeTestClusterConfig } from './tests/postgres/test-cluster.mjs'; console.log(getSafeTestClusterConfig().targetUrl.toString())",
  ], {
    cwd: projectRoot,
    env: {
      ...process.env,
      FACEID_TEST_DATABASE_URL: 'postgres://postgres@127.0.0.1/faceid_rc_local',
    },
    encoding: 'utf8',
    shell: false,
  })

  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /127\.0\.0\.1:55432\/faceid_rc_local/)
})

test('route harness rejects an owned-looking but stopped PostgreSQL cluster', async () => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'route-harness-stopped-'))
  try {
    await writeFile(path.join(dataDir, 'PG_VERSION'), '18\n')
    await writeFile(path.join(dataDir, '.faceattend-test-postgres-18'), 'faceattend-test-postgres-18\n')
    const { assertRunningPostgres18Cluster } = await import('./test-cluster.mjs')

    assert.throws(
      () => assertRunningPostgres18Cluster({
        dataDir,
        targetUrl: new URL('postgres://postgres@127.0.0.1:55432/faceid_rc_local'),
      }),
      /must be running/,
    )
  } finally {
    await rm(dataDir, { recursive: true, force: true })
  }
})

test('postgres reset rejects an owned-looking but stopped PostgreSQL cluster', async () => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'reset-harness-stopped-'))
  try {
    await writeFile(path.join(dataDir, 'PG_VERSION'), '18\n')
    await writeFile(path.join(dataDir, '.faceattend-test-postgres-18'), 'faceattend-test-postgres-18\n')
    const result = spawnSync(process.execPath, ['scripts/postgres-test.mjs', 'reset'], {
      cwd: projectRoot,
      env: {
        ...process.env,
        FACEID_TEST_DATABASE_URL: 'postgres://postgres@127.0.0.1:55432/faceid_rc_local',
        FACEID_TEST_PG_DATA: dataDir,
      },
      encoding: 'utf8',
      shell: false,
    })

    assert.notEqual(result.status, 0)
    assert.match(`${result.stdout}\n${result.stderr}`, /must be running/)
  } finally {
    await rm(dataDir, { recursive: true, force: true })
  }
})

test('postgres stop rejects an owned-looking but stopped cluster', async () => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'stop-harness-stopped-'))
  try {
    await writeFile(path.join(dataDir, 'PG_VERSION'), '18\n')
    await writeFile(path.join(dataDir, '.faceattend-test-postgres-18'), 'faceattend-test-postgres-18\n')
    const result = spawnSync(process.execPath, ['scripts/postgres-test.mjs', 'stop'], {
      cwd: projectRoot,
      env: {
        ...process.env,
        FACEID_TEST_DATABASE_URL: 'postgres://postgres@127.0.0.1:55432/faceid_rc_local',
        FACEID_TEST_PG_DATA: dataDir,
      },
      encoding: 'utf8',
      shell: false,
    })

    assert.notEqual(result.status, 0)
    assert.match(`${result.stdout}\n${result.stderr}`, /must be running/)
  } finally {
    await rm(dataDir, { recursive: true, force: true })
  }
})

for (const unsafe of [
  '',
  'postgres://postgres@db.example.com/faceid_rc_local',
  'postgres://postgres@127.0.0.1:55432/faceid',
  'postgres://user@example.site4now.net/faceid_rc_remote',
  'mysql://postgres@127.0.0.1:55432/faceid_rc_local',
  'postgres://postgres@127.0.0.1:55432/faceid_rc_a/other',
  'postgres://postgres@127.0.0.1:55432/faceid_rc_a%2Fb',
  'postgres://user@127.0.0.1/faceid_rc_safe?host=production.example',
]) {
  test(`rejects unsafe test URL ${unsafe || '<empty>'}`, () => {
    assert.throws(
      () => assertSafeTestDatabaseUrl(unsafe),
      /FACEID_TEST_DATABASE_URL|loopback|faceid_rc_/,
    )
  })
}
