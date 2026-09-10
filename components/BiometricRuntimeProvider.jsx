'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { useCamera } from '@/hooks/useCamera'
import { getLocationStartupOptions, requestBestDeviceLocation } from '@/lib/device-location'
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
  const locationRequestRef = useRef(null)

  useEffect(() => () => locationRequestRef.current?.abort(), [pathname])

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
    locationRequestRef.current?.abort()
    const controller = new AbortController()
    locationRequestRef.current = controller
    let locationFailed = false
    const cameraPromise = camOn ? Promise.resolve() : startCamera()
    const locationPromise = kioskRoute
      ? requestBestDeviceLocation({
        ...getLocationStartupOptions(policy),
        signal: controller.signal,
        onProgress: ({ accuracyMeters }) => {
          if (controller.signal.aborted) return
          setBootStage('location')
          setLocationState(current => ({ ...current, accuracyMeters,
            status: `Location estimate: ±${Math.round(accuracyMeters)} m. Waiting for a clearer reading…` }))
        },
      }).catch(error => { locationFailed = true; throw error })
      : Promise.resolve(null)

    if (kioskRoute) {
      setLocationState(current => ({
        ...current,
        bypassed: false,
        error: null,
        ready: false,
        status: 'Requesting device location...',
      }))
    }

    try {
      const [_, position] = await Promise.all([cameraPromise, locationPromise])
      if (controller.signal.aborted) return
      if (kioskRoute && position) {
        const accuracyMeters = Number(position.coords.accuracy)
        if (Number.isFinite(accuracyMeters) && accuracyMeters > Number(policy.maxAccuracyMeters)) {
          locationFailed = true
          throw new Error(`Your device reports an approximate location (±${Math.round(accuracyMeters)} m). Attendance requires ±${Math.round(policy.maxAccuracyMeters)} m or better. Enable precise location if available. On a desktop or laptop, turn on Wi-Fi and Location services, or use a phone at the office. Then check again.`)
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
          updatedAt: position.timestamp,
          wifiSsid: getWifiSsid(),
        })
      }
      setBootStage('ready')
    } catch (error) {
      if (controller.signal.aborted) return
      controller.abort()
      if (kioskRoute && locationFailed) {
        setLocationState(current => ({
          ...current,
          error: getLocationErrorMessage(error),
          ready: false,
          status: 'Location needs attention',
        }))
      }
      setRuntimeError(locationFailed ? getLocationErrorMessage(error) : error?.message || 'Unable to start the camera.')
      setBootStage('error')
    } finally {
      setPermissionRequestPending(false)
    }
  }, [camOn, kioskRoute, permissionRequestPending, requiresImmediateCamera, startCamera])

  useEffect(() => {
    if (!autoStartKey) return
    setAutoStartKey(0)
    requestPermissions()
  }, [autoStartKey, requestPermissions])

  useEffect(() => {
    if (!kioskRoute || !locationState.ready) return undefined

    let cancelled = false
    let refreshing = false
    const controller = new AbortController()
    const refreshLocation = async () => {
      if (refreshing) return
      refreshing = true
      try {
        const policy = locationPolicyRef.current
        const position = await requestBestDeviceLocation({
          ...policy,
          timeout: 8000,
          maximumAge: LOCATION_CACHE_MAX_AGE_MS,
          signal: controller.signal,
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
      } finally { refreshing = false }
    }

    const interval = window.setInterval(refreshLocation, LOCATION_REFRESH_INTERVAL_MS)
    return () => {
      cancelled = true
      controller.abort()
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


