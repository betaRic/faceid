import { stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const emptyServerOnlyUrl = 'data:text/javascript,export%20{}'

function isInsideProject(candidate) {
  const relative = path.relative(projectRoot, candidate)
  return relative && !relative.startsWith('..') && !path.isAbsolute(relative)
}

async function findSourceFile(basePath) {
  const candidates = [
    basePath,
    `${basePath}.js`,
    `${basePath}.jsx`,
    path.join(basePath, 'index.js'),
    path.join(basePath, 'index.jsx'),
  ]

  for (const candidate of candidates) {
    try {
      if ((await stat(candidate)).isFile()) return candidate
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error
    }
  }
  return null
}

export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'server-only') {
    return { url: emptyServerOnlyUrl, format: 'module', shortCircuit: true }
  }

  if (specifier === 'next/server') {
    return nextResolve('next/server.js', context)
  }

  if ((specifier.startsWith('./') || specifier.startsWith('../')) && context.parentURL?.startsWith('file:')) {
    const basePath = fileURLToPath(new URL(specifier, context.parentURL))
    const sourceFile = await findSourceFile(basePath)
    if (sourceFile) {
      return {
        url: pathToFileURL(sourceFile).href,
        shortCircuit: true,
      }
    }
  }

  if (!specifier.startsWith('@/')) {
    return nextResolve(specifier, context)
  }

  const basePath = path.resolve(projectRoot, specifier.slice(2))
  if (!isInsideProject(basePath)) {
    throw new Error(`Alias import escapes project root: ${specifier}`)
  }

  const sourceFile = await findSourceFile(basePath)
  if (!sourceFile) {
    throw new Error(`Cannot resolve alias import: ${specifier}`)
  }

  return {
    url: pathToFileURL(sourceFile).href,
    shortCircuit: true,
  }
}
