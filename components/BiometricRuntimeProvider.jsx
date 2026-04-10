'use client'

import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { usePathname } from 'next/navigation'
import { useCamera } from '../hooks/useCamera'
import { areModelsReady, getModelLoadStatus, loadModels } from '../lib/biometrics/human'
import {
  LOCATION_BOOT_TIMEOUT_MS,
  LOCATION_CACHE_MAX_AGE_MS,
  LOCATION_REFRESH_INTERVAL_MS,
} from '../lib/config'

const BiometricRuntimeContext = createContext(null)

function isBiometricRoute(pathname) {
  return pathname === '/kiosk' || pathname === '/registration'
}

function isKioskRoute(pathname) {
  return pathname === '/kiosk'
}

function getDefaultLocationState() {
  return {
    bypassed: false,
    coords: null,
    error: null,
    ready: false,
    status: 'Location idle',
    updatedAt: 0,
  }
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
  const [modelsReady, setModelsReady] = useState(areModelsReady())
  const [modelStatus, setModelStatus] = useState(getModelLoadStatus())
  const [bootStage, setBootStage] = useState(areModelsReady() ? 'idle' : 'models')
  const [runtimeError, setRuntimeError] = useState(null)
  const [locationState, setLocationState] = useState(getDefaultLocationState())
  const [locationBypassed, setLocationBypassed] = useState(false)
  const [retryKey, setRetryKey] = useState(0)

  useEffect(() => {
    let active = true
    let refreshInterval = null

    if (!biometricRoute) {
      stopCamera()
      setRuntimeError(null)
      setBootStage(areModelsReady() ? 'idle' : 'models')
      setLocationState(getDefaultLocationState())
      setLocationBypassed(false)
      return () => {
        active = false
      }
    }

    async function resolveLocation({ boot = false } = {}) {
      setLocationState(current => ({
        ...current,
        bypassed: locationBypassed,
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
        })
        setLocationBypassed(false)
        return true
      } catch (error) {
        if (!active) return false

        let hadKnownLocation = false
        setLocationState(current => {
          hadKnownLocation = Boolean(current.coords)

          return {
            ...current,
            bypassed: locationBypassed,
            coords: current.coords,
            error: error?.message || 'Unable to determine device location.',
            ready: hadKnownLocation,
            status: hadKnownLocation
              ? 'Using last known location'
              : locationBypassed
                ? 'Location unavailable, WFH fallback active'
                : 'Location unavailable',
            updatedAt: current.updatedAt,
          }
        })
        return hadKnownLocation
      }
    }

    const boot = async () => {
      setRuntimeError(null)

      try {
        if (!areModelsReady()) {
          setBootStage('models')
          setModelStatus(getModelLoadStatus())
          await loadModels(message => {
            if (!active) return
            setBootStage('models')
            setModelStatus(message)
          })
        }

        if (!active) return

        setModelsReady(true)
        setModelStatus('Ready')

        if (kioskRoute) {
          setBootStage('location')
          const locationResolved = await resolveLocation({ boot: true })

          if (!active) return

          if (!locationResolved && !locationBypassed) {
            setRuntimeError('Enable location before starting the kiosk. If the employee is on WFH today, continue without GPS and the kiosk will allow WFH-only attendance attempts.')
            return
          }

          refreshInterval = window.setInterval(() => {
            resolveLocation().catch(() => {})
          }, LOCATION_REFRESH_INTERVAL_MS)
        }

        setBootStage('camera')
        await startCamera()

        if (!active) return
        setBootStage('ready')
      } catch (error) {
        if (!active) return
        setRuntimeError(error?.message || 'Unable to prepare the biometric workspace.')
        setBootStage('error')
      }
    }

    boot()

    return () => {
      active = false
      if (refreshInterval) window.clearInterval(refreshInterval)
    }
  }, [biometricRoute, kioskRoute, locationBypassed, retryKey, startCamera, stopCamera])

  const value = useMemo(() => ({
    biometricRoute,
    bootStage,
    camera,
    canBypassLocation: kioskRoute && bootStage === 'location' && Boolean(runtimeError),
    continueWithoutLocation() {
      setRuntimeError(null)
      setLocationBypassed(true)
      setLocationState(current => ({
        ...current,
        bypassed: true,
        error: current.error,
        ready: false,
        status: 'Location unavailable, WFH fallback active',
      }))
    },
    kioskRoute,
    locationState: {
      ...locationState,
      bypassed: locationBypassed || locationState.bypassed,
    },
    modelStatus,
    modelsReady,
    retry() {
      stopCamera()
      setLocationBypassed(false)
      setLocationState(getDefaultLocationState())
      setRetryKey(current => current + 1)
    },
    runtimeError,
    workspaceReady: biometricRoute
      ? (
        modelsReady
        && camOn
        && bootStage === 'ready'
        && (!kioskRoute || locationState.ready || locationBypassed)
      )
      : true,
  }), [biometricRoute, bootStage, camOn, camera, kioskRoute, locationBypassed, locationState, modelStatus, modelsReady, runtimeError, stopCamera])

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

