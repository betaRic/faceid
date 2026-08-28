import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const resetRoutePath = path.join(projectRoot, 'app', 'api', 'persons', '[personId]', 'biometric-reset', 'route.js')
const reenrollRoutePath = path.join(projectRoot, 'app', 'api', 'persons', '[personId]', 'reenroll', 'route.js')

test('destructive biometric reset is removed while controlled re-enrollment remains', async () => {
  assert.equal(existsSync(resetRoutePath), false, 'destructive biometric-reset route must not exist')

  const [editorSource, navigatorSource, personStoreSource, reenrollRouteSource] = await Promise.all([
    readFile(path.join(projectRoot, 'components', 'admin', 'EmployeeEditorModal.jsx'), 'utf8'),
    readFile(path.join(projectRoot, 'components', 'PlatformNavigator.jsx'), 'utf8'),
    readFile(path.join(projectRoot, 'lib', 'postgres', 'person-store.js'), 'utf8'),
    readFile(reenrollRoutePath, 'utf8'),
  ])

  assert.doesNotMatch(editorSource, /handleBiometricReset|biometric-reset|Reset face data|resetConfirmOpen/)
  assert.doesNotMatch(navigatorSource, /reset face data/i)
  assert.doesNotMatch(personStoreSource, /resetLocalPersonBiometrics/)

  assert.equal(existsSync(reenrollRoutePath), true)
  assert.match(reenrollRouteSource, /refreshLocalPersonBiometrics/)
  assert.match(personStoreSource, /export async function refreshLocalPersonBiometrics/)
})
