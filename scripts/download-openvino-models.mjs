#!/usr/bin/env node

import { createHash } from 'crypto'
import { existsSync } from 'fs'
import { mkdir, readFile, writeFile } from 'fs/promises'
import path from 'path'

const MODEL_ROOT = process.env.OPENVINO_MODEL_DIR
  ? path.resolve(process.env.OPENVINO_MODEL_DIR)
  : path.join(process.cwd(), 'public', 'models', 'openvino')

const MODEL_FILES = [
  {
    path: 'face-detection-retail-0004/FP16/face-detection-retail-0004.xml',
    url: 'https://storage.openvinotoolkit.org/repositories/open_model_zoo/2023.0/models_bin/1/face-detection-retail-0004/FP16/face-detection-retail-0004.xml',
    sha384: 'a7f8d1d41998503c4f3cdd8c12275f04f1736e5142127edcb4c76c3e17188499390574095a5b2a9dd78d3d0f77d02034',
  },
  {
    path: 'face-detection-retail-0004/FP16/face-detection-retail-0004.bin',
    url: 'https://storage.openvinotoolkit.org/repositories/open_model_zoo/2023.0/models_bin/1/face-detection-retail-0004/FP16/face-detection-retail-0004.bin',
    sha384: '394185d3e42c34d7f9d43229ec8f5755c07e19fd6469d23883e71707fdd8eb66d90cbd62248db90ff3ba1c94adac599b',
  },
  {
    path: 'landmarks-regression-retail-0009/FP16/landmarks-regression-retail-0009.xml',
    url: 'https://storage.openvinotoolkit.org/repositories/open_model_zoo/2023.0/models_bin/1/landmarks-regression-retail-0009/FP16/landmarks-regression-retail-0009.xml',
    sha384: '393eda465df2a886f7edd932e2f1cd6930ae91f85708f91b4cd60e411acfb86e9de9e083907901208e9e8af639846572',
  },
  {
    path: 'landmarks-regression-retail-0009/FP16/landmarks-regression-retail-0009.bin',
    url: 'https://storage.openvinotoolkit.org/repositories/open_model_zoo/2023.0/models_bin/1/landmarks-regression-retail-0009/FP16/landmarks-regression-retail-0009.bin',
    sha384: '0e6e830387f56783de313e0f7022b7808fd2e9e0b28b411a65608e2c1df0bcf939c65fb699fc51868df30232d6308515',
  },
  {
    path: 'face-reidentification-retail-0095/FP16/face-reidentification-retail-0095.xml',
    url: 'https://storage.openvinotoolkit.org/repositories/open_model_zoo/2023.0/models_bin/1/face-reidentification-retail-0095/FP16/face-reidentification-retail-0095.xml',
    sha384: '689fb39e94bbd0d22cfeeb9292d0b91ac753424a7ee2c0555070e4038a00bfcaad473b47303012b9a393027dbad0dbce',
  },
  {
    path: 'face-reidentification-retail-0095/FP16/face-reidentification-retail-0095.bin',
    url: 'https://storage.openvinotoolkit.org/repositories/open_model_zoo/2023.0/models_bin/1/face-reidentification-retail-0095/FP16/face-reidentification-retail-0095.bin',
    sha384: '6d51703e854509dafdab9dfc6b932136d301d95be6d52c9c23b5a4f5de1ffec80e8d38b87e0e9556ad36f0dded1588ed',
  },
]

async function sha384(filePath) {
  const data = await readFile(filePath)
  return createHash('sha384').update(data).digest('hex')
}

async function downloadFile(modelFile) {
  const target = path.join(MODEL_ROOT, modelFile.path)
  await mkdir(path.dirname(target), { recursive: true })

  if (existsSync(target)) {
    const actual = await sha384(target)
    if (actual === modelFile.sha384) {
      console.log(`ok ${modelFile.path}`)
      return
    }
    console.log(`refresh ${modelFile.path}`)
  } else {
    console.log(`download ${modelFile.path}`)
  }

  const response = await fetch(modelFile.url)
  if (!response.ok) {
    throw new Error(`Failed to download ${modelFile.path}: ${response.status} ${response.statusText}`)
  }

  const bytes = Buffer.from(await response.arrayBuffer())
  const actual = createHash('sha384').update(bytes).digest('hex')
  if (actual !== modelFile.sha384) {
    throw new Error(`Checksum mismatch for ${modelFile.path}`)
  }

  await writeFile(target, bytes)
}

for (const modelFile of MODEL_FILES) {
  await downloadFile(modelFile)
}

console.log(`OpenVINO models ready at ${MODEL_ROOT}`)
