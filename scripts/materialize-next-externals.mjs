import { cp, lstat, mkdir, readdir, readFile, realpath, rm, stat } from 'node:fs/promises'
import { builtinModules, createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

function packagePath(root, packageName) {
  return path.join(root, ...String(packageName).split('/'))
}

const builtInModuleNames = new Set(builtinModules.map(name => name.replace(/^node:/, '')))

function isWithinPath(root, candidate) {
  const relative = path.relative(path.resolve(root), path.resolve(candidate))
  return Boolean(relative) && !relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative)
}

async function readPackageJson(packageDirectory) {
  const packageFile = path.join(packageDirectory, 'package.json')
  try {
    return JSON.parse(await readFile(packageFile, 'utf8'))
  } catch (error) {
    throw new Error(`Cannot read package metadata at ${packageFile}: ${error instanceof Error ? error.message : String(error)}`)
  }
}

async function findPackageDirectory(startPath, packageName, projectNodeModules) {
  let currentPath = path.dirname(startPath)
  while (isWithinPath(projectNodeModules, currentPath) || path.resolve(currentPath) === path.resolve(projectNodeModules)) {
    const packageFile = path.join(currentPath, 'package.json')
    try {
      const metadata = JSON.parse(await readFile(packageFile, 'utf8'))
      if (metadata.name === packageName) return currentPath
    } catch {}
    const parentPath = path.dirname(currentPath)
    if (parentPath === currentPath) break
    currentPath = parentPath
  }
  throw new Error(`Cannot find package metadata for ${packageName} beneath ${projectNodeModules}`)
}

async function resolveInstalledPackage(packageName, fromDirectory, projectNodeModules) {
  try {
    const requireFromPackage = createRequire(pathToFileURL(path.join(fromDirectory, 'package.json')))
    const entryFile = requireFromPackage.resolve(packageName)
    return await findPackageDirectory(entryFile, packageName, projectNodeModules)
  } catch (error) {
    throw new Error(`Cannot resolve runtime dependency ${packageName} from ${fromDirectory}: ${error instanceof Error ? error.message : String(error)}`)
  }
}

function runtimeDependencyNames(metadata) {
  return [...new Set([
    ...Object.keys(metadata.dependencies || {}),
    ...Object.keys(metadata.optionalDependencies || {}),
  ])]
}

async function copyRuntimeDependencies({ sourceDirectory, outputNodeModules, projectNodeModules, copiedPackages }) {
  const metadata = await readPackageJson(sourceDirectory)
  for (const packageName of runtimeDependencyNames(metadata)) {
    if (builtInModuleNames.has(packageName.replace(/^node:/, ''))) continue
    const destinationDirectory = packagePath(outputNodeModules, packageName)
    const destinationKey = path.resolve(destinationDirectory).toLowerCase()
    if (copiedPackages.has(destinationKey)) continue

    let dependencyDirectory
    try {
      dependencyDirectory = await resolveInstalledPackage(packageName, sourceDirectory, projectNodeModules)
    } catch (error) {
      if (Object.hasOwn(metadata.optionalDependencies || {}, packageName)) continue
      throw error
    }

    copiedPackages.add(destinationKey)
    await mkdir(path.dirname(destinationDirectory), { recursive: true })
    await cp(dependencyDirectory, destinationDirectory, { recursive: true, dereference: true, force: false, errorOnExist: false })
    await copyRuntimeDependencies({
      sourceDirectory: dependencyDirectory,
      outputNodeModules,
      projectNodeModules,
      copiedPackages,
    })
  }
}

export async function materializeNextExternalPackages({
  projectRoot = process.cwd(),
  distDir = path.join(projectRoot, '.next'),
} = {}) {
  const projectNodeModules = path.resolve(projectRoot, 'node_modules')
  const outputNodeModules = path.resolve(distDir, 'node_modules')
  let entries
  try {
    entries = await readdir(outputNodeModules, { withFileTypes: true })
  } catch (error) {
    if (error?.code === 'ENOENT') return { aliases: [] }
    throw error
  }

  const aliases = []
  const copiedPackages = new Set()
  for (const entry of entries) {
    const aliasPath = path.join(outputNodeModules, entry.name)
    const linkStatus = await lstat(aliasPath)
    if (!linkStatus.isSymbolicLink()) continue

    const sourceDirectory = await realpath(aliasPath)
    if (!isWithinPath(projectNodeModules, sourceDirectory)) {
      throw new Error(`Refusing to materialize alias outside project node_modules: ${aliasPath}`)
    }
    if (!(await stat(sourceDirectory)).isDirectory()) {
      throw new Error(`Refusing to materialize alias that is not a directory: ${aliasPath}`)
    }

    await rm(aliasPath, { recursive: true, force: true })
    await cp(sourceDirectory, aliasPath, { recursive: true, dereference: true })
    aliases.push(entry.name)
    await copyRuntimeDependencies({
      sourceDirectory,
      outputNodeModules,
      projectNodeModules,
      copiedPackages,
    })
  }

  return { aliases }
}

async function main() {
  const result = await materializeNextExternalPackages()
  console.log(result.aliases.length
    ? `Materialized Next.js runtime packages: ${result.aliases.join(', ')}`
    : 'No Next.js runtime package aliases required materialization.')
}

if (process.argv[1] && import.meta.url.startsWith('file:') && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack : error)
    process.exitCode = 1
  })
}
