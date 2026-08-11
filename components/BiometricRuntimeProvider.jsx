'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { useCamera } from '@/hooks/useCamera'
import { areDetectorModelsReady, areModelsReady, getModelLoadStatus, loadModels } from '@/lib/biometrics/human'
import {
  LOCATION_BOOT_TIMEOUT_MS,
  LOCATION_CACHE_MAX_AGE_MS,
  LOCATION_REFRESH_INTERVAL_MS,
} from '@/lib/config'

const BiometricRuntimeContext = createContext(null)

function isBiometricRoute(pathname) {
  return pathname === '/kiosk' || pathname === '/scan' || pathname === '/registration' || pathname.startsWith('/admin/employee/')
}

function isKioskRoute(pathname) {
  return pathname === '/kiosk' || pathname === '/scan'
}

function isAdminReenrollRoute(pathname) {
  return pathname.startsWith('/admin/employee/')
}

function getDefaultLocationState() {
  return {
    bypassed: false,
    coords: null,
    error: null,
    ready: false,
    status: 'Location idle',
    updatedAt: 0,
    wifiSsid: null,
    accuracyMeters: null,
  }
}

function getWifiSsid() {
  if (typeof navigator === 'undefined' || !navigator.connection) return null
  return navigator.connection.ssid || null
}

function requestDeviceLocation(options = {}) {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      reject(new Error('Location services are not available on this device.'))
      return
    }

    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: LOCATION_BOOT_TIMEOUT_MS,
      maximumAge: LOCATION_CACHE_MAX_AGE_MS,
      ...options,
    })
  })
}

async function hasGrantedDevicePermissions(requireLocation) {
  if (typeof navigator === 'undefined' || !navigator.permissions?.query) return false
  try {
    const checks = [navigator.permissions.query({ name: 'camera' })]
    if (requireLocation) checks.push(navigator.permissions.query({ name: 'geolocation' }))
    const states = await Promise.all(checks)
    return states.every(permission => permission.state === 'granted')
  } catch {
    // Some Safari versions do not expose every permission through this API.
    // In that case, keep the explicit first-use action instead of guessing.
    return false
  }
}

function getLocationErrorMessage(error) {
  if (Number(error?.code) === 1) {
    return 'Location permission was denied. Allow Location for this site in the browser settings, then tap Retry.'
  }
  if (Number(error?.code) === 2) {
    return 'Location is currently unavailable. Turn on device Location, then move near a window or outdoors and retry.'
  }
  if (Number(error?.code) === 3) {
    return 'Location request timed out. Turn on device Location, improve the signal, and retry.'
  }
  return error?.message || 'Unable to determine device location.'
}

async function requestBestDeviceLocation({ timeout, maximumAge, sampleCount, targetAccuracyMeters }) {
  const attempts = Math.max(1, Math.min(5, Number(sampleCount) || 1))
  const totalTimeout = Math.max(8000, Number(timeout) || LOCATION_BOOT_TIMEOUT_MS)
  // Give phones enough time for the initial GPS fix. Subsequent samples only refine it.
  const initialTimeout = attempts === 1
    ? totalTimeout
    : Math.max(8000, totalTimeout - ((attempts - 1) * 5000))
  let best = null
  let lastError = null
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const position = await requestDeviceLocation({
        timeout: attempt === 0 ? initialTimeout : 5000,
        maximumAge,
      })
      if (!best || Number(position.coords.accuracy || Infinity) < Number(best.coords.accuracy || Infinity)) best = position
      if (Number(best.coords.accuracy || Infinity) <= Number(targetAccuracyMeters || 0)) break
    } catch (error) {
      lastError = error
      // Some Android browsers cannot provide a high-accuracy GPS fix indoors
      // but can still supply a usable network location. Keep the same policy
      // accuracy limit; this only changes how the reading is acquired.
      if (attempt === 0 && Number(error?.code) !== 1) {
        try {
          const fallback = await requestDeviceLocation({
            enableHighAccuracy: false,
            timeout: Math.min(10000, totalTimeout),
            maximumAge: 60_000,
          })
          if (!best || Number(fallback.coords.accuracy || Infinity) < Number(best.coords.accuracy || Infinity)) best = fallback
        } catch (fallbackError) { lastError = fallbackError }
      }
    }
  }
  if (best) return best
  throw lastError || new Error('Unable to determine device location.')
}

export function BiometricRuntimeProvider({ children }) {
  const pathname = usePathname()
  const camera = useCamera()
  const { camOn, start: startCamera, stop: stopCamera } = camera
  const biometricRoute = isBiometricRoute(pathname)
  const kioskRoute = isKioskRoute(pathname)
  const adminReenrollRoute = isAdminReenrollRoute(pathname)
  const requiresImmediateCamera = kioskRoute || adminReenrollRoute
  const [modelsReady, setModelsReady] = useState(areDetectorModelsReady())
  const [modelStatus, setModelStatus] = useState(getModelLoadStatus())
  const [bootStage, setBootStage] = useState(areDetectorModelsReady() ? 'idle' : 'models')
  const [runtimeError, setRuntimeError] = useState(null)
  const [locationState, setLocationState] = useState(getDefaultLocationState())
  const [retryKey, setRetryKey] = useState(0)
  const locationPolicyRef = useRef({ bootTimeoutMs: LOCATION_BOOT_TIMEOUT_MS, targetAccuracyMeters: 50, maxAccuracyMeters: 250, sampleCount: 3 })
  const [permissionRequestPending, setPermissionRequestPending] = useState(false)
  const [autoStartKey, setAutoStartKey] = useState(0)

  useEffect(() => {
    let active = true
    let locationPolicy = { bootTimeoutMs: LOCATION_BOOT_TIMEOUT_MS, targetAccuracyMeters: 50, maxAccuracyMeters: 250, sampleCount: 3 }

    if (!biometricRoute) {
      stopCamera()
      setRuntimeError(null)
      setBootStage(areDetectorModelsReady() ? 'idle' : 'models')
      setLocationState(getDefaultLocationState())
      return () => {
        active = false
      }
    }

    const boot = async () => {
      setRuntimeError(null)

      try {
        const policyResponse = await fetch('/api/system/location-policy', { cache: 'no-store' })
        const policyData = await policyResponse.json().catch(() => null)
        if (policyResponse.ok && policyData?.policy) locationPolicy = { ...locationPolicy, ...policyData.policy }
        locationPolicyRef.current = locationPolicy
        if (!areDetectorModelsReady()) {
          setBootStage('models')
          setModelStatus('Loading face detector...')
          await loadModels(status => {
            if (active) setModelStatus(status)
          }, { requireFull: false })
        } else if (!areModelsReady()) {
          setModelStatus(getModelLoadStatus())
        }

        setModelsReady(true)
        setModelStatus(areModelsReady() ? 'Ready' : getModelLoadStatus())

        if (!areModelsReady()) {
          loadModels(status => {
            if (active) setModelStatus(status)
          }, { requireFull: true })
            .then(() => {
              if (active) setModelStatus('Ready')
            })
            .catch(error => {
              if (active) setModelStatus('Error: ' + (error?.message || 'Failed to load verification models'))
            })
        }

        if (requiresImmediateCamera) {
          if (await hasGrantedDevicePermissions(kioskRoute)) {
            setBootStage('camera')
            setAutoStartKey(current => current + 1)
            return
          }
          // iOS Safari may silently suppress camera/GPS prompts created from an
          // effect. The user must initiate these requests from the workspace gate.
          setBootStage('permission')
          return
        }

        if (!active) return
        setBootStage('ready')
      } catch (error) {
        if (!active) return
        setRuntimeError(error?.message || 'Workspace failed')
        setModelStatus('Error: ' + error?.message)
        setBootStage('error')
      }
    }

    boot()

    return () => {
      active = false
    }
  }, [biometricRoute, kioskRoute, requiresImmediateCamera, retryKey, startCamera, stopCamera])

  const requestPermissions = useCallback(async () => {
    if (!requiresImmediateCamera || permissionRequestPending) return

    if (typeof window === 'undefined' || !window.isSecureContext) {
      setRuntimeError('Camera and location require a secure HTTPS connection. On an iPhone, localhost refers to the phone itself; open the trusted HTTPS test or production address instead.')
      setBootStage('error')
      return
    }

    setPermissionRequestPending(true)
    setRuntimeError(null)
    setBootStage('permission')

    const policy = locationPolicyRef.current
    // Start both browser permission requests before awaiting either result. This
    // preserves the tap gesture Safari requires for camera and GPS prompts.
    const cameraPromise = startCamera()
    const locationPromise = kioskRoute
      ? requestBestDeviceLocation({
        timeout: policy.bootTimeoutMs,
        maximumAge: 0,
        ...policy,
      })
      : Promise.resolve(null)

    if (kioskRoute) {
      setLocationState(current => ({
        ...current,
        bypassed: false,
        error: null,
        status: 'Requesting device location...',
      }))
    }

    try {
      const [_, position] = await Promise.all([cameraPromise, locationPromise])
      if (kioskRoute && position) {
        const accuracyMeters = Number(position.coords.accuracy)
        if (Number.isFinite(accuracyMeters) && accuracyMeters > Number(policy.maxAccuracyMeters)) {
          throw new Error(`Location accuracy is ±${Math.round(accuracyMeters)} m. Improve the device location signal and try again.`)
        }
        setLocationState({
          bypassed: false,
          coords: {
            latitude: Number(position.coords.latitude),
            longitude: Number(position.coords.longitude),
          },
          accuracyMeters: Number.isFinite(accuracyMeters) ? accuracyMeters : null,
          error: null,
          ready: true,
          status: 'Location ready',
          updatedAt: Date.now(),
          wifiSsid: getWifiSsid(),
        })
      }
      setBootStage('ready')
    } catch (error) {
      if (kioskRoute) {
        setLocationState(current => ({
          ...current,
          error: getLocationErrorMessage(error),
          ready: Boolean(current.coords),
          status: current.coords ? 'Using last known location' : 'Location unavailable',
        }))
      }
      setRuntimeError(error?.message || 'Camera or location permission could not be started.')
      setBootStage('error')
    } finally {
      setPermissionRequestPending(false)
    }
  }, [kioskRoute, permissionRequestPending, requiresImmediateCamera, startCamera])

  useEffect(() => {
    if (!autoStartKey) return
    setAutoStartKey(0)
    requestPermissions()
  }, [autoStartKey, requestPermissions])

  useEffect(() => {
    if (!kioskRoute || !locationState.ready) return undefined

    let cancelled = false
    const refreshLocation = async () => {
      try {
        const policy = locationPolicyRef.current
        const position = await requestBestDeviceLocation({
          timeout: 8000,
          maximumAge: LOCATION_CACHE_MAX_AGE_MS,
          ...policy,
        })
        const accuracyMeters = Number(position.coords.accuracy)
        if (cancelled || (Number.isFinite(accuracyMeters) && accuracyMeters > Number(policy.maxAccuracyMeters))) return
        setLocationState(current => ({
          ...current,
          coords: { latitude: Number(position.coords.latitude), longitude: Number(position.coords.longitude) },
          accuracyMeters: Number.isFinite(accuracyMeters) ? accuracyMeters : null,
          error: null,
          ready: true,
          status: 'Location ready',
          updatedAt: Date.now(),
          wifiSsid: getWifiSsid(),
        }))
      } catch {
        // Keep the last verified coordinate. A later scan still applies server-side
        // geofence validation and can ask the user to retry if the policy requires it.
      }
    }

    const interval = window.setInterval(refreshLocation, LOCATION_REFRESH_INTERVAL_MS)
    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [kioskRoute, locationState.ready])

  const value = useMemo(() => ({
    biometricRoute,
    bootStage,
    camera,
    kioskRoute,
    locationState: {
      ...locationState,
      bypassed: false,
    },
    modelStatus,
    modelsReady,
    permissionRequestPending,
    requestPermissions,
    retry() {
      stopCamera()
      setLocationState(getDefaultLocationState())
      setRetryKey(current => current + 1)
    },
    runtimeError,
    workspaceReady: biometricRoute
      ? (
        modelsReady
        && bootStage === 'ready'
        && (!requiresImmediateCamera || camOn)
        && (!kioskRoute || locationState.ready)
      )
      : true,
  }), [biometricRoute, bootStage, camOn, camera, kioskRoute, locationState, modelStatus, modelsReady, permissionRequestPending, requestPermissions, requiresImmediateCamera, runtimeError, stopCamera])

  return (
    <BiometricRuntimeContext.Provider value={value}>
      {children}
    </BiometricRuntimeContext.Provider>
  )
}

export function useBiometricRuntime() {
  const context = useContext(BiometricRuntimeContext)
  if (!context) {
    throw new Error('useBiometricRuntime must be used inside BiometricRuntimeProvider')
  }
  return context
}


