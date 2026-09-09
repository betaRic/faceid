import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { assessHostingEnvironment } from './lib/hosting-env-policy.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
try {
  if (Number(process.versions.node.split('.')[0]) !== 22) throw new Error('Use Node 22 for the hosting build.')
  const files = await readdir(root)
  const example = await readFile(path.join(root, '.env.example'), 'utf8')
  const settingNames = [...example.matchAll(/^([A-Z][A-Z0-9_]*)=/gm)].map(match => match[1])
  const issues = assessHostingEnvironment({ files, env: process.env, settingNames })
  if (issues.length) {
    console.error('Hosting build stopped before changing build output. No setting values are shown.')
    for (const issue of issues) console.error(`- ${issue}`)
    console.error('Keep local settings unchanged. Use a clean terminal/build checkout; do not upload local settings to the live site.')
    process.exitCode = 1
  } else {
    console.log('Hosting settings check passed: no automatically loaded settings files or inherited application settings.')
    console.log('Development-only settings are ignored. Live server settings still require separate verification.')
  }
} catch (error) {
  console.error(error?.message === 'Use Node 22 for the hosting build.' ? error.message : 'Unable to verify hosting settings; build stopped.')
  process.exitCode = 1
}
