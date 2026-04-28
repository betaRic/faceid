#!/usr/bin/env node

import { existsSync } from 'fs'
import { mkdir, readFile, readdir, stat, writeFile } from 'fs/promises'
import path from 'path'
import { pathToFileURL } from 'url'
import { generateServerFaceEmbedding } from '../lib/biometrics/server-embedding-core.js'
import { generateOpenVinoRetailEmbedding } from '../lib/biometrics/openvino-retail-embedding.js'
import { buildShadowBenchmarkReport } from '../lib/biometrics/shadow-benchmark.js'

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp'])

function usage() {
  console.log('Usage:')
  console.log('  npm run biometric:shadow-benchmark -- --dataset <manifest.json|dataset-dir> [--out <report.json>]')
  console.log('  OPENVINO_REMOTE_URL=https://service.up.railway.app OPENVINO_BENCHMARK_SECRET=... npm run biometric:shadow-benchmark -- --dataset <manifest.json|url> --engines human,openvino-remote')
  console.log('')
  console.log('Manifest samples:')
  console.log('  { "samples": [{ "personId": "E001", "split": "enroll", "imagePath": "E001/enroll/center.jpg" }] }')
  console.log('')
  console.log('Directory layout:')
  console.log('  dataset-dir/<person-id>/enroll/*.jpg')
  console.log('  dataset-dir/<person-id>/query/*.jpg')
}

function parseArgs(argv) {
  const args = { dataset: '', out: '', engines: ['human', 'openvino'] }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--dataset') args.dataset = argv[++index] || ''
    else if (arg === '--out') args.out = argv[++index] || ''
    else if (arg === '--engines') args.engines = String(argv[++index] || '').split(',').map(value => value.trim()).filter(Boolean)
    else if (!args.dataset && !arg.startsWith('--')) args.dataset = arg
  }
  return args
}

function mimeFromPath(filePath) {
  const ext = path.extname(filePath).toLowerCase()
  if (ext === '.png') return 'image/png'
  if (ext === '.webp') return 'image/webp'
  return 'image/jpeg'
}

async function fileToDataUrl(filePath) {
  const bytes = await readFile(filePath)
  return `data:${mimeFromPath(filePath)};base64,${bytes.toString('base64')}`
}

function normalizeSplit(value) {
  const split = String(value || '').trim().toLowerCase()
  if (split === 'query' || split === 'probe' || split === 'scan') return 'query'
  return 'enroll'
}

function isHttpUrl(value) {
  return /^https?:\/\//i.test(String(value || ''))
}

async function loadManifestSamples(datasetPath) {
  const remote = isHttpUrl(datasetPath)
  const manifest = remote
    ? await fetch(datasetPath).then(response => {
        if (!response.ok) throw new Error(`Failed to fetch manifest: ${response.status} ${response.statusText}`)
        return response.json()
      })
    : JSON.parse(await readFile(datasetPath, 'utf8'))
  const root = remote ? new URL('.', datasetPath) : path.dirname(datasetPath)
  const samples = Array.isArray(manifest?.samples) ? manifest.samples : []
  return samples.map((sample, index) => {
    const imagePath = !remote && sample.imagePath ? path.resolve(root, sample.imagePath) : ''
    const url = typeof sample.url === 'string'
      ? sample.url
      : remote && sample.imagePath
        ? new URL(sample.imagePath, root).href
        : ''
    return {
      sampleId: String(sample.sampleId || `${sample.personId || sample.employeeId || sample.label || 'sample'}-${index}`),
      personId: String(sample.personId || sample.employeeId || sample.label || '').trim(),
      employeeId: String(sample.employeeId || sample.personId || sample.label || '').trim(),
      label: String(sample.label || sample.name || sample.employeeId || sample.personId || '').trim(),
      split: normalizeSplit(sample.split),
      phaseId: String(sample.phaseId || '').trim(),
      frameDataUrl: typeof sample.frameDataUrl === 'string' ? sample.frameDataUrl : '',
      imagePath,
      url,
    }
  })
}

async function listImageFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...await listImageFiles(fullPath))
    } else if (IMAGE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      files.push(fullPath)
    }
  }
  return files.sort((left, right) => left.localeCompare(right))
}

async function loadDirectorySamples(datasetPath) {
  const people = await readdir(datasetPath, { withFileTypes: true })
  const samples = []

  for (const person of people.filter(entry => entry.isDirectory())) {
    const personId = person.name
    const personDir = path.join(datasetPath, person.name)
    for (const split of ['enroll', 'query']) {
      const splitDir = path.join(personDir, split)
      if (!existsSync(splitDir)) continue
      const files = await listImageFiles(splitDir)
      files.forEach((filePath, index) => {
        samples.push({
          sampleId: `${personId}-${split}-${index}-${path.basename(filePath)}`,
          personId,
          employeeId: personId,
          label: personId,
          split,
          phaseId: path.basename(filePath, path.extname(filePath)),
          imagePath: filePath,
          frameDataUrl: '',
          url: '',
        })
      })
    }
  }

  return samples
}

async function loadDataset(datasetPath) {
  if (isHttpUrl(datasetPath)) return loadManifestSamples(datasetPath)
  const absolute = path.resolve(datasetPath)
  const info = await stat(absolute)
  return info.isDirectory() ? loadDirectorySamples(absolute) : loadManifestSamples(absolute)
}

async function loadSampleImage(sample) {
  if (sample.frameDataUrl) {
    return {
      dataUrl: sample.frameDataUrl,
      buffer: Buffer.from(sample.frameDataUrl.split(',')[1] || '', 'base64'),
    }
  }
  if (sample.url) {
    const response = await fetch(sample.url)
    if (!response.ok) throw new Error(`Failed to fetch ${sample.url}: ${response.status} ${response.statusText}`)
    const buffer = Buffer.from(await response.arrayBuffer())
    return { dataUrl: `data:image/jpeg;base64,${buffer.toString('base64')}`, buffer }
  }
  const buffer = await readFile(sample.imagePath)
  return {
    dataUrl: await fileToDataUrl(sample.imagePath),
    buffer,
  }
}

function summarizeConsole(report) {
  for (const [engine, result] of Object.entries(report.engines || {})) {
    console.log('')
    console.log(engine)
    console.log(`  evidence: ${result.evidenceStatus}`)
    console.log(`  usable/rejected: ${result.usableSampleCount}/${result.rejectedSampleCount}`)
    console.log(`  people/queries: ${result.personCount}/${result.evaluatedQueryCount}`)
    console.log(`  top1 accuracy: ${result.identification.top1Accuracy}`)
    console.log(`  mismatches: ${result.identification.top1Mismatch}`)
    console.log(`  genuine p95: ${result.distributions.genuine.p95}`)
    console.log(`  impostor p05: ${result.distributions.impostor.p05}`)
    console.log(`  separation gap: ${result.distributions.separationGap}`)
    const gate = result.thresholdSearch.recommendedZeroFalseAccept
    console.log(`  zero-false-accept gate: ${gate ? `threshold=${gate.threshold}, margin=${gate.margin}, correctAccept=${gate.correctAccept}/${gate.evaluated}` : 'none'}`)
  }
}

async function runEngine(engine, sample, image) {
  const base = {
    engine,
    sampleId: sample.sampleId,
    personId: sample.personId,
    employeeId: sample.employeeId,
    label: sample.label,
    split: sample.split,
    phaseId: sample.phaseId,
  }

  try {
    let result = null
    if (engine === 'openvino') {
      result = await generateOpenVinoRetailEmbedding(image.buffer)
    } else if (engine === 'openvino-remote') {
      const baseUrl = String(process.env.OPENVINO_REMOTE_URL || '').replace(/\/+$/, '')
      const secret = String(process.env.OPENVINO_BENCHMARK_SECRET || '')
      if (!baseUrl || !secret) {
        throw new Error('OPENVINO_REMOTE_URL and OPENVINO_BENCHMARK_SECRET are required for openvino-remote.')
      }
      const startedAt = Date.now()
      const response = await fetch(`${baseUrl}/api/openvino/smoke`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${secret}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ frameDataUrl: image.dataUrl }),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok || !payload?.ok) {
        result = {
          ok: false,
          decisionCode: payload?.decisionCode || 'blocked_remote_embedding_failed',
          message: payload?.message || `Remote OpenVINO request failed with ${response.status}.`,
          performanceMs: payload?.performanceMs ?? Date.now() - startedAt,
        }
      } else if (!Array.isArray(payload.descriptor)) {
        result = {
          ok: false,
          decisionCode: 'blocked_remote_descriptor_missing',
          message: 'Remote OpenVINO descriptor was not returned. Set OPENVINO_BENCHMARK_RETURN_DESCRIPTOR=true on Railway for benchmark runs.',
          performanceMs: payload.performanceMs ?? Date.now() - startedAt,
        }
      } else {
        result = {
          ok: true,
          descriptor: payload.descriptor,
          descriptorLength: payload.descriptorLength,
          performanceMs: payload.performanceMs ?? Date.now() - startedAt,
          face: { score: payload.faceScore ?? null },
        }
      }
    } else {
      result = await generateServerFaceEmbedding(image.dataUrl)
    }

    if (!result.ok) {
      return {
        ...base,
        ok: false,
        decisionCode: result.decisionCode || 'blocked_embedding_failed',
        performanceMs: result.performanceMs ?? null,
      }
    }

    return {
      ...base,
      ok: true,
      descriptor: result.descriptor,
      descriptorLength: result.descriptorLength,
      performanceMs: result.performanceMs ?? null,
      faceScore: result.face?.score ?? null,
    }
  } catch (error) {
    return {
      ...base,
      ok: false,
      decisionCode: 'blocked_embedding_error',
      message: error instanceof Error ? error.message : 'Embedding failed.',
    }
  }
}

const args = parseArgs(process.argv.slice(2))
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  usage()
  process.exit(0)
}

if (!args.dataset) {
  usage()
  process.exit(1)
}

const samples = await loadDataset(args.dataset)
if (samples.length === 0) {
  throw new Error('No benchmark samples found. Provide a manifest or dataset directory with enroll/query images.')
}

const samplesByEngine = Object.fromEntries(args.engines.map(engine => [engine, []]))
for (let index = 0; index < samples.length; index += 1) {
  const sample = samples[index]
  const image = await loadSampleImage(sample)
  console.log(`[${index + 1}/${samples.length}] ${sample.employeeId || sample.personId} ${sample.split} ${sample.phaseId || sample.sampleId}`)

  for (const engine of args.engines) {
    if (!samplesByEngine[engine]) samplesByEngine[engine] = []
    samplesByEngine[engine].push(await runEngine(engine, sample, image))
  }
}

const report = buildShadowBenchmarkReport(samplesByEngine, {
  datasetSource: isHttpUrl(args.dataset) ? args.dataset : path.resolve(args.dataset),
})

summarizeConsole(report)

if (args.out) {
  const outPath = path.resolve(args.out)
  await mkdir(path.dirname(outPath), { recursive: true })
  await writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`)
  console.log('')
  console.log(`Report written: ${pathToFileURL(outPath).href}`)
}
