import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { migrateTestDatabase } from './test-database.mjs'
import { discoverRouteTestFiles, requireRouteTestFiles } from './route-test-files.mjs'
import {
  assertOwnedPostgres18Cluster,
  assertRunningPostgres18Cluster,
  getSafeTestClusterConfig,
} from './test-cluster.mjs'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const { targetUrl, dataDir } = getSafeTestClusterConfig()
assertOwnedPostgres18Cluster(dataDir)

let testFiles
try {
  testFiles = requireRouteTestFiles(
    await discoverRouteTestFiles(path.join(projectRoot, 'tests', 'postgres')),
  )
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
}

if (testFiles) {
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
