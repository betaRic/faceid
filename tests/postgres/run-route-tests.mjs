import { spawnSync } from 'node:child_process'
import { readdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { migrateTestDatabase } from './test-database.mjs'
import {
  assertOwnedPostgres18Cluster,
  assertRunningPostgres18Cluster,
  getSafeTestClusterConfig,
} from './test-cluster.mjs'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const { targetUrl, dataDir } = getSafeTestClusterConfig()
assertOwnedPostgres18Cluster(dataDir)

const entries = await readdir(path.join(projectRoot, 'tests', 'postgres'), { withFileTypes: true })
const testFiles = entries
  .filter(entry => entry.isFile() && entry.name.endsWith('.routes.test.mjs'))
  .map(entry => path.join(projectRoot, 'tests', 'postgres', entry.name))
  .sort()

if (testFiles.length === 0) {
  console.error('No PostgreSQL route tests found.')
  process.exitCode = 1
} else {
  assertRunningPostgres18Cluster({ dataDir, targetUrl })
  await migrateTestDatabase({ projectRoot, databaseUrl: targetUrl.toString() })
  const loaderUrl = pathToFileURL(path.join(projectRoot, 'tests', 'postgres', 'route-loader.mjs')).href
  const result = spawnSync(process.execPath, [
    '--experimental-loader', loaderUrl,
    '--test',
    ...process.argv.slice(2),
    ...testFiles,
  ], {
    cwd: projectRoot,
    env: {
      ...process.env,
      DATABASE_URL: targetUrl.toString(),
      DATA_BACKEND: 'postgres',
      NODE_ENV: 'test',
      NEXT_PUBLIC_SITE_URL: 'http://127.0.0.1:3000',
    },
    shell: false,
    stdio: 'inherit',
  })
  if (result.error) throw result.error
  process.exitCode = result.status === null ? 1 : result.status
}
