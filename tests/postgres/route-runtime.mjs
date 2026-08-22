import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import path from 'node:path'

const createdRuntimeDirectories = new Set()

function getRuntimeRoot(projectRoot) {
  return path.resolve(projectRoot, '.faceattend-test-runtime')
}

function assertContainedRuntimeDirectory(projectRoot, directory) {
  const runtimeRoot = getRuntimeRoot(projectRoot)
  const resolvedDirectory = path.resolve(directory)
  const relative = path.relative(runtimeRoot, resolvedDirectory)
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('Route test runtime directory must stay inside the route test runtime root')
  }
  return resolvedDirectory
}

export async function createRouteRuntimeDir(projectRoot) {
  const runtimeRoot = getRuntimeRoot(projectRoot)
  await mkdir(runtimeRoot, { recursive: true })
  const runtimeDirectory = assertContainedRuntimeDirectory(
    projectRoot,
    await mkdtemp(path.join(runtimeRoot, 'route-tests-')),
  )
  createdRuntimeDirectories.add(runtimeDirectory)
  return runtimeDirectory
}

export async function removeRouteRuntimeDir(projectRoot, directory) {
  const runtimeDirectory = assertContainedRuntimeDirectory(projectRoot, directory)
  if (!createdRuntimeDirectories.has(runtimeDirectory)) {
    throw new Error('Route test cleanup can remove only a runner-created directory')
  }
  try {
    await rm(runtimeDirectory, { recursive: true, force: true })
  } finally {
    createdRuntimeDirectories.delete(runtimeDirectory)
  }
}
