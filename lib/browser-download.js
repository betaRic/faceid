export function getDownloadFilename(response, fallbackFilename = 'download') {
  const disposition = response?.headers?.get?.('Content-Disposition') || ''
  const utfMatch = disposition.match(/filename\*=UTF-8''([^;]+)/i)
  if (utfMatch) return decodeURIComponent(utfMatch[1].trim())

  const match = disposition.match(/filename="?([^";]+)"?/i)
  if (match) return match[1].trim()

  return fallbackFilename
}

export async function downloadResponseBlob(response, fallbackFilename = 'download') {
  const blob = await response.blob()
  const filename = getDownloadFilename(response, fallbackFilename)
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}
