import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { assertSafeTestDatabaseUrl } from './test-database.mjs'
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

test('postgres init refuses a pre-existing unmarked data directory', async () => {
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

test('route runner fails when no route tests exist', async () => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'faceattend-route-empty-'))
  try {
    await writeFile(path.join(dataDir, 'PG_VERSION'), '18\n')
    await writeFile(path.join(dataDir, '.faceattend-test-postgres-18'), 'faceattend-test-postgres-18\n')
    const result = spawnSync(process.execPath, ['tests/postgres/run-route-tests.mjs'], {
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
    assert.match(`${result.stdout}\n${result.stderr}`, /No PostgreSQL route tests found/)
  } finally {
    await rm(dataDir, { recursive: true, force: true })
  }
})

test('route runner uses Node experimental loader spelling', async () => {
  const source = await readFile(path.join(projectRoot, 'tests', 'postgres', 'run-route-tests.mjs'), 'utf8')
  assert.match(source, /--experimental-loader/)
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
  const dataRoot = 'D:\\faceattend-test-data'
  await mkdir(dataRoot, { recursive: true })
  const dataDir = await mkdtemp(path.join(dataRoot, 'route-harness-stopped-'))
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
  const dataRoot = 'D:\\faceattend-test-data'
  await mkdir(dataRoot, { recursive: true })
  const dataDir = await mkdtemp(path.join(dataRoot, 'reset-harness-stopped-'))
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
