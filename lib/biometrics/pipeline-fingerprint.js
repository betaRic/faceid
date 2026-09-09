import { createHash } from 'node:crypto'
import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical)
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]))
  if (typeof value === 'function' || typeof value === 'undefined') throw new Error('Unidentifiable pipeline configuration')
  return value
}

function localAsset(base, name) {
  if (typeof name !== 'string' || !name || path.isAbsolute(name) || /^[a-z]+:/i.test(name)) throw new Error('Nonlocal pipeline asset')
  const resolved = path.resolve(base, name)
  const relative = path.relative(path.resolve(base), resolved)
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Pipeline asset outside model directory')
  return resolved
}

function activeModels(config, found = new Set()) {
  if (!config || typeof config !== 'object' || config.enabled === false) return found
  if (config.modelPath) found.add(config.modelPath)
  for (const value of Object.values(config)) if (value && typeof value === 'object') activeModels(value, found)
  return found
}

// Called only around runtime initialization, never by post-response collection.
// Versions come from loaded modules; manifest shards and all available WASM variants
// are hashed so selecting SIMD/threads cannot silently cross pipeline identities.
export async function snapshotPipelineFingerprint({ config, preprocessing, versions, modelBasePath, wasmBasePath }) {
  if (!versions?.human || !versions.tfjsCore || !versions.tfjsBackendWasm || !versions.sharp?.sharp) throw new Error('Missing runtime version')
  const { modelBasePath: _modelLocation, wasmPath: _wasmLocation, ...effectiveConfig } = config
  const hash = createHash('sha256')
  hash.update(JSON.stringify(canonical({ config: effectiveConfig, preprocessing, versions })))
  const addAsset = (name, bytes) => { hash.update(JSON.stringify([name, bytes.length])); hash.update(bytes) }
  const models = [...activeModels(effectiveConfig)].sort()
  if (!models.length) throw new Error('Missing model identity')
  for (const name of models) {
    const json = await readFile(localAsset(modelBasePath, name))
    addAsset(`model:${name}`, json)
    const manifest = JSON.parse(json.toString('utf8')).weightsManifest
    if (!Array.isArray(manifest) || !manifest.length) throw new Error('Missing model weights manifest')
    const shards = [...new Set(manifest.flatMap(group => group.paths || []))].sort()
    if (!shards.length) throw new Error('Missing model weights')
    for (const shard of shards) {
      const relative = path.join(path.dirname(name), shard)
      addAsset(`weight:${relative.replaceAll('\\', '/')}`, await readFile(localAsset(modelBasePath, relative)))
    }
  }
  const wasmFiles = (await readdir(wasmBasePath)).filter(name => name.endsWith('.wasm')).sort()
  if (!wasmFiles.length) throw new Error('Missing WASM runtime')
  for (const name of wasmFiles) addAsset(`wasm:${name}`, await readFile(localAsset(wasmBasePath, name)))
  return hash.digest('hex')
}

export async function loadWithPipelineIdentity({ enabled, snapshot, load }) {
  const optionalSnapshot = async () => { try { return await snapshot() } catch { return null } }
  const before = enabled ? await optionalSnapshot() : null
  const runtime = await load()
  const after = enabled && before ? await optionalSnapshot() : null
  return { runtime, pipelineFingerprint: before && before === after && /^[a-f0-9]{64}$/.test(before) ? before : null }
}

export function acceptedFramesPipelineFingerprint(frames) {
  if (!Array.isArray(frames) || frames.length !== 2) return null
  const fingerprint = frames[0]?.pipelineFingerprint
  return typeof fingerprint === 'string' && /^[a-f0-9]{64}$/.test(fingerprint)
    && frames.every(frame => frame?.pipelineFingerprint === fingerprint) ? fingerprint : null
}
