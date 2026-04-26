function cleanLabel(text) {
  return String(text || '')
    .replace(/^✓\s*/u, '')
    .replace(/^⚠️\s*/u, '')
    .replace(/\.{2,}$/u, '')
    .trim()
}

export function toCompactGuideLabel(text, fallback = 'Center face') {
  const cleaned = cleanLabel(text)
  if (!cleaned) return fallback

  const lower = cleaned.toLowerCase()

  if (lower.includes('loading models')) return 'Preparing camera'
  if (lower.includes('waiting for camera')) return 'Starting camera'
  if (lower.includes('camera not ready')) return 'Camera not ready'
  if (lower.includes('camera error')) return 'Retrying camera'
  if (lower.includes('camera off') || lower.includes('camera offline')) return 'Camera off'
  if (lower.includes('verifying')) return 'Verifying'
  if (lower.includes('scanning for face')) return 'Find your face'
  if (lower.includes('move into the oval')) return 'Center face'
  if (lower.includes('position your face')) return 'Center face'
  if (lower.includes('center your face')) return 'Center face'
  if (lower.includes('look directly')) return 'Center face'
  if (lower.includes('look straight')) return 'Center face'
  if (lower.includes('face detected')) return 'Hold still'
  if (lower.includes('hold steady')) return 'Hold still'
  if (lower.includes('capturing')) return 'Hold still'
  if (lower.includes('hold that angle')) return 'Hold still'
  if (lower.includes('good position')) return 'Hold still'
  if (lower.includes('turn your head to either side')) return 'Turn left or right'
  if (lower.includes('turn your head the other way')) return 'Turn other side'
  if (lower.includes('turn your head to the right')) return 'Turn right'
  if (lower.includes('turn your head to the left')) return 'Turn left'
  if (lower.includes('other direction')) return 'Turn other side'
  if (lower.includes('tilt your chin down')) return 'Chin down'
  if (lower.includes('chin slightly down')) return 'Hold still'
  if (lower.includes('move closer') || lower === 'closer') return 'Move closer'
  if (lower.includes('ease back')) return 'Ease back'
  if (lower.includes('move back')) return 'Move back'
  if (lower.includes('try again')) return 'Try again'

  return cleaned.replace(/[.!?]+$/u, '')
}
