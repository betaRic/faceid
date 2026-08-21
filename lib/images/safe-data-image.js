import sharp from 'sharp'

const DATA_IMAGE_PATTERN = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/i

function invalidImage(message) {
  return Object.assign(new Error(message), {
    code: 'invalid_enrollment_photo',
    status: 400,
  })
}

function decodeBase64Image(value, maxBytes) {
  const match = String(value || '').trim().match(DATA_IMAGE_PATTERN)
  if (!match || match[2].length % 4 !== 0) {
    throw invalidImage('Choose a valid JPEG, PNG, or WebP image.')
  }

  const padding = match[2].endsWith('==') ? 2 : (match[2].endsWith('=') ? 1 : 0)
  const decodedBytes = (match[2].length * 3 / 4) - padding
  if (decodedBytes <= 0 || decodedBytes > maxBytes) {
    throw invalidImage(`Enrollment photo is too large. Maximum decoded size is ${maxBytes} bytes.`)
  }

  const buffer = Buffer.from(match[2], 'base64')
  if (buffer.length !== decodedBytes) {
    throw invalidImage('Choose a valid JPEG, PNG, or WebP image.')
  }
  return { buffer, declaredFormat: match[1].toLowerCase() }
}

export async function normalizeDataImage(
  value,
  { maxBytes = 7 * 1024 * 1024, maxPixels = 20_000_000 } = {},
) {
  const { buffer, declaredFormat } = decodeBase64Image(value, maxBytes)
  try {
    const metadata = await sharp(buffer, {
      failOn: 'warning',
      limitInputPixels: false,
    }).metadata()
    const actualFormat = metadata.format === 'jpg' ? 'jpeg' : metadata.format
    if (!['jpeg', 'png', 'webp'].includes(actualFormat) || actualFormat !== declaredFormat) {
      throw invalidImage('Choose a valid JPEG, PNG, or WebP image.')
    }
    const width = Number(metadata.width || 0)
    const height = Number(metadata.height || 0)
    if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
      throw invalidImage('Enrollment photo dimensions are invalid.')
    }
    if (width * height > maxPixels) {
      throw invalidImage(`Enrollment photo exceeds the ${maxPixels}-pixel limit.`)
    }

    return {
      buffer: await sharp(buffer, {
        failOn: 'warning',
        limitInputPixels: maxPixels,
      }).autoOrient().jpeg({ quality: 88 }).toBuffer(),
      extension: '.jpg',
      mimeType: 'image/jpeg',
    }
  } catch (error) {
    if (error?.code === 'invalid_enrollment_photo') throw error
    throw invalidImage('Choose a valid JPEG, PNG, or WebP image.')
  }
}
