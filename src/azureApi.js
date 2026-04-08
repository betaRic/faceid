import { AZURE_ENDPOINT, AZURE_KEY } from './config'

async function azureApi(path, method = 'GET', body = null, isBlob = false) {
  const opts = { method, headers: { 'Ocp-Apim-Subscription-Key': AZURE_KEY } }
  if (body && isBlob) { opts.headers['Content-Type'] = 'image/jpeg'; opts.body = body }
  else if (body) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body) }
  const resp = await fetch(AZURE_ENDPOINT + path, opts)
  const ct = resp.headers.get('content-type') || ''
  const data = ct.includes('json') ? await resp.json() : await resp.text()
  if (!resp.ok) throw new Error(data?.error?.message || JSON.stringify(data))
  return data
}

// Detection only — age, gender, smile, glasses, emotion
export async function detectFacesAzure(blob) {
  return azureApi(
    '/face/v1.0/detect?returnFaceId=true&returnFaceAttributes=glasses,headPose,blur,exposure,noise,qualityForRecognition,mask&detectionModel=detection_01&recognitionModel=recognition_04',
    'POST', blob, true
  )
}
