/**
 * download-models.js
 * Downloads face-api.js model weights from jsdelivr into public/models/
 * Run once: node scripts/download-models.js
 */
const https = require('https')
const fs = require('fs')
const path = require('path')

const BASE_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model'
const OUT_DIR = path.join(__dirname, '..', 'public', 'models')

const FILES = [
  'ssd_mobilenetv1_model-weights_manifest.json',
  'ssd_mobilenetv1_model-shard1',
  'ssd_mobilenetv1_model-shard2',
  'face_landmark_68_model-weights_manifest.json',
  'face_landmark_68_model-shard1',
  'face_recognition_model-weights_manifest.json',
  'face_recognition_model-shard1',
  'face_recognition_model-shard2',
]

fs.mkdirSync(OUT_DIR, { recursive: true })

let completed = 0
FILES.forEach(file => {
  const url = `${BASE_URL}/${file}`
  const dest = path.join(OUT_DIR, file)
  if (fs.existsSync(dest)) {
    console.log(`  SKIP  ${file}`)
    completed++
    if (completed === FILES.length) console.log('\nAll models ready!')
    return
  }
  process.stdout.write(`  GET   ${file} ... `)
  const out = fs.createWriteStream(dest)
  https.get(url, res => {
    res.pipe(out)
    out.on('finish', () => {
      out.close()
      console.log('done')
      completed++
      if (completed === FILES.length) console.log('\nAll models ready! Run: npm run dev')
    })
  }).on('error', err => {
    fs.unlink(dest, () => {})
    console.error('ERROR:', err.message)
  })
})
