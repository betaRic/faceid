const MOBILE_USER_AGENT_PATTERN = /Android|iPhone|iPad|iPod|Mobile/i

function toFiniteNumber(value) {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

function getSafeNavigator() {
  return typeof navigator !== 'undefined' ? navigator : null
}

export function isProbablyMobileDevice() {
  const nav = getSafeNavigator()
  if (!nav) return false

  try {
    if (typeof nav.userAgentData?.mobile === 'boolean') {
      return nav.userAgentData.mobile
    }
  } catch {}

  return MOBILE_USER_AGENT_PATTERN.test(nav.userAgent || '')
}

export function getNavigatorDeviceProfile() {
  const nav = getSafeNavigator()
  if (!nav) {
    return {
      userAgent: '',
      platform: '',
      mobile: false,
      deviceMemoryGb: null,
      hardwareConcurrency: null,
      screenOrientation: '',
      devicePixelRatio: null,
    }
  }

  let uaDataMobile = null
  try {
    uaDataMobile = nav.userAgentData?.mobile ?? null
  } catch {}

  return {
    userAgent: String(nav.userAgent || '').slice(0, 512),
    platform: String(nav.platform || '').slice(0, 120),
    mobile: uaDataMobile ?? MOBILE_USER_AGENT_PATTERN.test(nav.userAgent || ''),
    deviceMemoryGb: toFiniteNumber(nav.deviceMemory),
    hardwareConcurrency: toFiniteNumber(nav.hardwareConcurrency),
    screenOrientation: typeof window !== 'undefined'
      ? String(window.screen?.orientation?.type || '').slice(0, 40)
      : '',
    devicePixelRatio: typeof window !== 'undefined'
      ? toFiniteNumber(window.devicePixelRatio)
      : null,
  }
}

export function getVideoTrackSettingsSnapshot(source) {
  const track = typeof source?.getSettings === 'function'
    ? source
    : source?.getVideoTracks?.()?.[0]

  if (!track || typeof track.getSettings !== 'function') return null

  const settings = track.getSettings() || {}
  return {
    width: toFiniteNumber(settings.width),
    height: toFiniteNumber(settings.height),
    aspectRatio: toFiniteNumber(settings.aspectRatio),
    frameRate: toFiniteNumber(settings.frameRate),
    facingMode: String(settings.facingMode || '').slice(0, 40),
    resizeMode: String(settings.resizeMode || '').slice(0, 40),
  }
}

export function getVideoTrackMetadata(source) {
  const settings = getVideoTrackSettingsSnapshot(source)
  return {
    trackWidth: settings?.width ?? null,
    trackHeight: settings?.height ?? null,
    trackAspectRatio: settings?.aspectRatio ?? null,
    trackFrameRate: settings?.frameRate ?? null,
    trackFacingMode: settings?.facingMode || '',
    trackResizeMode: settings?.resizeMode || '',
  }
}

export function getClientBiometricProfile(source) {
  return {
    ...getNavigatorDeviceProfile(),
    ...getVideoTrackMetadata(source),
  }
}
