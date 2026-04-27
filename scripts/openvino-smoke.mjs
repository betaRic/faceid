#!/usr/bin/env node

import { readFile } from 'fs/promises'
import {
  assertOpenVinoRetailModelsAvailable,
  cosineDistance,
  generateOpenVinoRetailEmbedding,
  getOpenVinoRetailModelPaths,
} from '../lib/biometrics/openvino-retail-embedding.js'

function printUsage() {
  console.log('Usage:')
  console.log('  npm run openvino:smoke -- --check')
  console.log('  npm run openvino:smoke -- <image-path-or-url-or-data-url>')
}

async function loadImage(input) {
  if (/^data:image\//i.test(input)) return input
  if (/^https?:\/\//i.test(input)) {
    const response = await fetch(input)
    if (!response.ok) throw new Error(`Failed to download smoke image: ${response.status} ${response.statusText}`)
    return Buffer.from(await response.arrayBuffer())
  }
  return readFile(input)
}

const arg = process.argv[2]

if (!arg || arg === '-h' || arg === '--help') {
  printUsage()
  process.exit(arg ? 0 : 1)
}

if (arg === '--check') {
  assertOpenVinoRetailModelsAvailable()
  console.log(JSON.stringify({
    ok: true,
    models: getOpenVinoRetailModelPaths(),
  }, null, 2))
  process.exit(0)
}

const image = await loadImage(arg)
const first = await generateOpenVinoRetailEmbedding(image)
if (!first.ok) {
  console.log(JSON.stringify(first, null, 2))
  process.exit(2)
}

const second = await generateOpenVinoRetailEmbedding(image)
const sameImageCosineDistance = second.ok
  ? cosineDistance(first.descriptor, second.descriptor)
  : null

console.log(JSON.stringify({
  ok: true,
  modelVersion: first.modelVersion,
  descriptorLength: first.descriptorLength,
  distanceMetric: first.distanceMetric,
  faceScore: first.face?.score ?? null,
  faceBox: first.face?.box ?? null,
  landmarkCount: first.face?.landmarks?.length ?? 0,
  firstRunMs: first.performanceMs,
  secondRunMs: second.performanceMs,
  sameImageCosineDistance,
  devices: first.diagnostics?.devices || [],
}, null, 2))
