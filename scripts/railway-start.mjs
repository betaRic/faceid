#!/usr/bin/env node

import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const nextBin = path.join(root, 'node_modules', 'next', 'dist', 'bin', 'next')
const port = String(process.env.PORT || '3000')

const child = spawn(process.execPath, [
  nextBin,
  'start',
  '-H',
  '0.0.0.0',
  '-p',
  port,
], {
  cwd: root,
  env: process.env,
  stdio: 'inherit',
})

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal)
    return
  }
  process.exit(code ?? 0)
})
