import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
const module = await import('../lib/biometrics/pipeline-fingerprint.js').catch(() => ({}))

test('runtime identity binds stable load and fails closed on changed or unavailable assets without failing inference', async () => {
  assert.equal(typeof module.loadWithPipelineIdentity, 'function')
  const runtime = {}
  let reads = 0
  const stable = await module.loadWithPipelineIdentity({ enabled: true, snapshot: async () => 'a'.repeat(64), load: async () => runtime })
  assert.equal(stable.runtime, runtime)
  assert.equal(stable.pipelineFingerprint, 'a'.repeat(64))
  const changed = await module.loadWithPipelineIdentity({ enabled: true, snapshot: async () => String(++reads).repeat(64), load: async () => runtime })
  assert.equal(changed.runtime, runtime)
  assert.equal(changed.pipelineFingerprint, null)
  const failed = await module.loadWithPipelineIdentity({ enabled: true, snapshot: async () => { throw Error('missing') }, load: async () => runtime })
  assert.equal(failed.runtime, runtime)
  assert.equal(failed.pipelineFingerprint, null)
  reads = 0
  const disabled = await module.loadWithPipelineIdentity({ enabled: false, snapshot: async () => { reads++; throw Error('must not read') }, load: async () => runtime })
  assert.equal(reads, 0)
  assert.equal(disabled.pipelineFingerprint, null)
  await assert.rejects(module.loadWithPipelineIdentity({ enabled: true, snapshot: async () => 'a', load: async () => { throw Error('inference load') } }), /inference load/)
})

test('frame collection accepts only the same established runtime identity', () => {
  assert.equal(typeof module.acceptedFramesPipelineFingerprint, 'function')
  const a = 'a'.repeat(64), b = 'b'.repeat(64)
  assert.equal(module.acceptedFramesPipelineFingerprint([{ pipelineFingerprint: a }, { pipelineFingerprint: a }]), a)
  for (const frames of [[], [{}], [{ pipelineFingerprint: a }, {}], [{ pipelineFingerprint: a }, { pipelineFingerprint: b }]]) {
    assert.equal(module.acceptedFramesPipelineFingerprint(frames), null)
  }
})

test('identity includes effective configuration, preprocessing, runtime versions, actual manifest shards and WASM while excluding deployment paths', async () => {
  assert.equal(typeof module.snapshotPipelineFingerprint, 'function')
  const root = await mkdtemp(path.join(os.tmpdir(), 'pipeline-proof-'))
  try {
    const modelBasePath = path.join(root, 'models'), wasmBasePath = path.join(root, 'wasm')
    await mkdir(modelBasePath); await mkdir(wasmBasePath)
    await writeFile(path.join(modelBasePath, 'face.json'), JSON.stringify({ weightsManifest: [{ paths: ['custom-shard.bin'] }] }))
    await writeFile(path.join(modelBasePath, 'custom-shard.bin'), 'weights-1')
    await writeFile(path.join(wasmBasePath, 'tfjs-backend-wasm.wasm'), 'wasm-1')
    const args = { modelBasePath, wasmBasePath, config: { backend: 'wasm', modelBasePath, wasmPath: wasmBasePath, face: { enabled: true, detector: { modelPath: 'face.json', minConfidence: .5 } } }, preprocessing: { version: 1, maxDimension: 512 }, versions: { human: '3', tfjsCore: '4', tfjsBackendWasm: '4', sharp: { sharp: '1', vips: '2' } } }
    const first = await module.snapshotPipelineFingerprint(args)
    assert.match(first, /^[a-f0-9]{64}$/)
    assert.equal(await module.snapshotPipelineFingerprint({ ...args, config: { ...args.config, modelBasePath: 'C:/elsewhere', wasmPath: 'C:/elsewhere' } }), first)
    for (const changed of [
      { ...args, preprocessing: { ...args.preprocessing, maxDimension: 256 } },
      { ...args, versions: { ...args.versions, tfjsBackendWasm: '5' } },
      { ...args, versions: { ...args.versions, sharp: { sharp: '2' } } },
      { ...args, config: { ...args.config, face: { ...args.config.face, detector: { ...args.config.face.detector, minConfidence: .6 } } } },
    ]) assert.notEqual(await module.snapshotPipelineFingerprint(changed), first)
    await writeFile(path.join(modelBasePath, 'custom-shard.bin'), 'weights-2')
    assert.notEqual(await module.snapshotPipelineFingerprint(args), first)
    await writeFile(path.join(modelBasePath, 'custom-shard.bin'), 'weights-1')
    await writeFile(path.join(wasmBasePath, 'tfjs-backend-wasm.wasm'), 'wasm-2')
    assert.notEqual(await module.snapshotPipelineFingerprint(args), first)
    await rm(path.join(modelBasePath, 'custom-shard.bin'))
    await assert.rejects(module.snapshotPipelineFingerprint(args))
  } finally { await rm(root, { recursive: true, force: true }) }
})
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

async function fakeEmbeddingRuntime({ enabled, fingerprintFails = false, qualityFails = false, existingBackend = undefined, incompleteModels = false } = {}) {
  process.env.BIOMETRIC_MEMORY_COLLECT_ENABLED = enabled ? 'true' : 'false'
  const counts = { snapshots: 0, quality: 0, data: 0 }
  const embeddingPath = path.resolve('lib/biometrics/server-embedding-core.js')
  const bindings = {
    loadWithPipelineIdentity: module.loadWithPipelineIdentity,
    snapshotPipelineFingerprint: async () => { counts.snapshots++; if (fingerprintFails) throw Error('asset read'); return 'a'.repeat(64) },
    measureFaceImageQuality: () => { counts.quality++; if (qualityFails) throw Error('optional quality'); return { sharpness: 99 } },
    sharp: () => {
      const image = { rotate: () => image, resize: () => image, removeAlpha: () => image, raw: () => image, toBuffer: async () => ({ data: new Uint8Array(12), info: { width: 2, height: 2, channels: 3 } }) }
      return image
    },
    Human: class {
      constructor(config) { this.config = config; this.models = { loaded: () => incompleteModels ? ['blazeface'] : ['blazeface', 'faceres', 'antispoof'] }; this.tf = { getBackend: () => existingBackend, tensor3d: () => ({ shape: [2, 2, 3], data: async () => { counts.data++; return new Uint8Array(12) } }), dispose: () => {} } }
      async load() {}
      async detect() { return { face: [{ embedding: [1, ...Array(1023).fill(0)], box: [0, 0, 2, 2], score: .99, real: .99 }] } }
    },
  }
  const key = `__pipelineTest${Math.random().toString(16).slice(2)}`
  globalThis[key] = bindings
  let source = await readFile(embeddingPath, 'utf8')
  source = source.replace("import sharp from 'sharp'", `const { sharp } = globalThis['${key}']`)
    .replace("import { measureFaceImageQuality } from './image-quality.js'", `const { measureFaceImageQuality } = globalThis['${key}']`)
    .replace("import { loadWithPipelineIdentity, snapshotPipelineFingerprint } from './pipeline-fingerprint.js'", `const { loadWithPipelineIdentity, snapshotPipelineFingerprint } = globalThis['${key}']`)
    .replace(/const require = createRequire\(import.meta.url\)[\s\S]*?const Human = HumanModule.default \|\| HumanModule.Human \|\| HumanModule/, `const { Human } = globalThis['${key}']`)
    .replace(/from '(\.\.?\/[^']+)'/g, (_, relative) => `from '${new URL(relative, pathToFileURL(embeddingPath)).href}'`)
  try { return { api: await import(`data:text/javascript,${encodeURIComponent(source)}`), counts } }
  finally { delete globalThis[key] }
}

test('embedding integration binds frames once, avoids disabled work, and survives optional provenance or quality failure', async () => {
  const previous = process.env.BIOMETRIC_MEMORY_COLLECT_ENABLED
  const input = 'data:image/jpeg;base64,YQ=='
  try {
    const enabled = await fakeEmbeddingRuntime({ enabled: true })
    const first = await enabled.api.generateServerAttendanceEmbedding(input)
    const second = await enabled.api.generateServerAttendanceEmbedding(input)
    assert.equal(first.pipelineFingerprint, 'a'.repeat(64))
    assert.equal(second.pipelineFingerprint, first.pipelineFingerprint)
    assert.equal(enabled.counts.snapshots, 2, 'runtime hashes once before and after loading, never per frame')
    assert.equal(enabled.counts.quality, 2)
    const disabled = await fakeEmbeddingRuntime({ enabled: false })
    assert.equal((await disabled.api.generateServerAttendanceEmbedding(input)).ok, true)
    assert.deepEqual(disabled.counts, { snapshots: 0, quality: 0, data: 0 })
    const failed = await fakeEmbeddingRuntime({ enabled: true, fingerprintFails: true })
    const accepted = await failed.api.generateServerAttendanceEmbedding(input)
    assert.equal(accepted.ok, true)
    assert.equal(accepted.pipelineFingerprint, null)
    assert.equal(accepted.face.quality, null)
    assert.equal(failed.counts.quality, 0)
    const quality = await fakeEmbeddingRuntime({ enabled: true, qualityFails: true })
    const noQuality = await quality.api.generateServerAttendanceEmbedding(input)
    assert.equal(noQuality.ok, true)
    assert.equal(noQuality.face.quality, null)
    const preloaded = await fakeEmbeddingRuntime({ enabled: true, existingBackend: 'wasm' })
    assert.equal((await preloaded.api.generateServerAttendanceEmbedding(input)).pipelineFingerprint, null)
    assert.equal(preloaded.counts.snapshots, 0)
    const incomplete = await fakeEmbeddingRuntime({ enabled: true, incompleteModels: true })
    assert.equal((await incomplete.api.generateServerAttendanceEmbedding(input)).pipelineFingerprint, null)
    const enrollmentFirst = await fakeEmbeddingRuntime({ enabled: true })
    await enrollmentFirst.api.generateServerEnrollmentEmbedding(input)
    assert.equal((await enrollmentFirst.api.generateServerAttendanceEmbedding(input)).pipelineFingerprint, null)
  } finally {
    if (previous === undefined) delete process.env.BIOMETRIC_MEMORY_COLLECT_ENABLED
    else process.env.BIOMETRIC_MEMORY_COLLECT_ENABLED = previous
  }
})

test('attendance propagates inference identity and post-response collection preserves it while rejecting mixed or missing identities', async () => {
  const previous = process.env.BIOMETRIC_MEMORY_COLLECT_ENABLED
  process.env.BIOMETRIC_MEMORY_COLLECT_ENABLED = 'true'
  const saved = []
  const scheduled = []
  globalThis.__memoryProvenanceBindings = {
    generateServerAttendanceEmbedding: async () => ({ ok: true, descriptor: [1, ...Array(1023).fill(0)], pipelineFingerprint: 'a'.repeat(64), face: { antispoof: .99 } }),
    after: job => scheduled.push(job),
    collectBiometricMemoryCandidate: async candidate => saved.push(candidate),
  }
  try {
    let attendanceSource = await readFile('lib/biometrics/server-attendance.js', 'utf8')
    attendanceSource = attendanceSource.replace("import 'server-only'", '')
      .replace("import { generateServerAttendanceEmbedding } from '@/lib/biometrics/server-embedding'", 'const { generateServerAttendanceEmbedding } = globalThis.__memoryProvenanceBindings')
      .replace(/from '@\/([^']+)'/g, (_, relative) => `from '${pathToFileURL(path.resolve(`${relative}.js`)).href}'`)
    const attendance = await import(`data:text/javascript,${encodeURIComponent(attendanceSource)}`)
    const payload = await attendance.buildAuthoritativeAttendancePayload(['data:image/jpeg;base64,YQ==', 'data:image/jpeg;base64,YQ=='])
    assert.equal(payload.acceptedFrames[0].pipelineFingerprint, 'a'.repeat(64))
    assert.equal(payload.acceptedFrames[1].pipelineFingerprint, 'a'.repeat(64))
    const collectionPath = path.resolve('lib/biometrics/memory-collection.js')
    let collectionSource = await readFile(collectionPath, 'utf8')
    collectionSource = collectionSource.replace("import 'server-only'", '')
      .replace("import { after } from 'next/server'", 'const { after } = globalThis.__memoryProvenanceBindings')
      .replace("import { collectBiometricMemoryCandidate } from '../postgres/biometric-memory-store'", 'const { collectBiometricMemoryCandidate } = globalThis.__memoryProvenanceBindings')
      .replace(/from '(\.\.?\/[^']+)'/g, (_, relative) => `from '${new URL(relative, pathToFileURL(collectionPath)).href}'`)
    const collection = await import(`data:text/javascript,${encodeURIComponent(collectionSource)}`)
    const args = { person: { id: 'a', descriptors: [[1, ...Array(1023).fill(0)]] }, entry: { timestamp: 1 }, attendanceId: 'attendance', personMatch: { ok: true, debug: { matchMode: 'claimed_access_code_1to1' } }, authoritativePayload: payload }
    assert.equal(collection.queueBiometricMemoryCollection(args), true)
    payload.acceptedFrames[1].pipelineFingerprint = 'b'.repeat(64)
    assert.equal(collection.queueBiometricMemoryCollection(args), false)
    delete payload.acceptedFrames[1].pipelineFingerprint
    assert.equal(collection.queueBiometricMemoryCollection(args), false)
    await scheduled[0]()
    assert.equal(saved.length, 1)
    assert.equal(saved[0].pipelineFingerprint, 'a'.repeat(64))
    assert.equal(saved[0].frames[1].pipelineFingerprint, 'a'.repeat(64))
  } finally {
    delete globalThis.__memoryProvenanceBindings
    if (previous === undefined) delete process.env.BIOMETRIC_MEMORY_COLLECT_ENABLED
    else process.env.BIOMETRIC_MEMORY_COLLECT_ENABLED = previous
  }
})
