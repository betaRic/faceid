'use client'

import { createContext, useContext, useEffect, useMemo, useState } from 'react'
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

  useEffect(() => {
    let active = true
    let refreshInterval = null

    if (!biometricRoute) {
      stopCamera()
      setRuntimeError(null)
      setBootStage(areDetectorModelsReady() ? 'idle' : 'models')
      setLocationState(getDefaultLocationState())
      return () => {
        active = false
      }
    }

    async function resolveLocation({ boot = false } = {}) {
      setLocationState(current => ({
        ...current,
        bypassed: false,
        error: null,
        status: boot ? 'Checking device location...' : 'Refreshing device location...',
      }))

      try {
        const position = await requestDeviceLocation({
          timeout: boot ? LOCATION_BOOT_TIMEOUT_MS : 6000,
          maximumAge: boot ? 0 : LOCATION_CACHE_MAX_AGE_MS,
        })

        if (!active) return true

        setLocationState({
          bypassed: false,
          coords: {
            latitude: Number(position.coords.latitude),
            longitude: Number(position.coords.longitude),
          },
          error: null,
          ready: true,
          status: 'Location ready',
          updatedAt: Date.now(),
          wifiSsid: getWifiSsid(),
        })
        return true
      } catch (error) {
        if (!active) return false

        let hadKnownLocation = false
        setLocationState(current => {
          hadKnownLocation = Boolean(current.coords)

          return {
            ...current,
            bypassed: false,
            coords: current.coords,
            error: error?.message || 'Unable to determine device location.',
            ready: hadKnownLocation,
            status: hadKnownLocation
              ? 'Using last known location'
              : 'Location unavailable',
            updatedAt: current.updatedAt,
            wifiSsid: getWifiSsid(),
          }
        })
        return hadKnownLocation
      }
    }

    const boot = async () => {
      setRuntimeError(null)

      try {
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

        if (kioskRoute) {
          setBootStage('location')
          const locationResolved = await resolveLocation({ boot: true })

          if (!active) return
          if (!locationResolved) {
            setRuntimeError('Verified GPS location is required before scan attendance can start.')
            return
          }
          let locationRefreshPending = false
          refreshInterval = window.setInterval(() => {
            if (locationRefreshPending) return
            locationRefreshPending = true
            resolveLocation().catch(() => {}).finally(() => { locationRefreshPending = false })
          }, LOCATION_REFRESH_INTERVAL_MS)
        }

        if (requiresImmediateCamera) {
          setBootStage('camera')
          await startCamera()
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
      if (refreshInterval) window.clearInterval(refreshInterval)
    }
  }, [biometricRoute, kioskRoute, requiresImmediateCamera, retryKey, startCamera, stopCamera])

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
  }), [biometricRoute, bootStage, camOn, camera, kioskRoute, locationState, modelStatus, modelsReady, requiresImmediateCamera, runtimeError, stopCamera])

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


