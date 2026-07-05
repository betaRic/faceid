'use client'

import 'leaflet/dist/leaflet.css'
import { useEffect, useRef, useState } from 'react'

// Region XII center (Koronadal / South Cotabato)
const REGION_XII_CENTER = [6.5069, 124.8480]
const DEFAULT_ZOOM = 11
const PINNED_ZOOM = 17

export default function OfficeLocationPicker({
  latitude,
  longitude,
  radiusMeters,
  onChange,
  officeId,
}) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const markerRef = useRef(null)
  const circleRef = useRef(null)
  const LRef = useRef(null)
  const [mapReady, setMapReady] = useState(false)

  const hasLocation = Number.isFinite(latitude) && Number.isFinite(longitude)

  // ── Boot Leaflet once ──────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    let cancelled = false

    import('leaflet').then(mod => {
      if (cancelled || !containerRef.current) return

      const L = mod.default ?? mod

      const center = hasLocation ? [latitude, longitude] : REGION_XII_CENTER
      const zoom   = hasLocation ? PINNED_ZOOM : DEFAULT_ZOOM

      const map = L.map(containerRef.current, {
        center,
        zoom,
        zoomControl: true,
        attributionControl: false,
      })

      // Click anywhere on the map → place / move the pin
      map.on('click', e => {
        onChange({
          latitude:  parseFloat(e.latlng.lat.toFixed(6)),
          longitude: parseFloat(e.latlng.lng.toFixed(6)),
        })
      })

      LRef.current   = L
      mapRef.current = map
      setMapReady(true)
    }).catch(err => {
      console.error('[OfficeLocationPicker] Leaflet failed to load:', err)
    })

    return () => {
      cancelled = true
      if (mapRef.current) {
        mapRef.current.remove()
        mapRef.current  = null
        markerRef.current = null
        circleRef.current = null
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // intentionally once — coords handled in the effect below

  // ── Sync marker + geofence circle whenever coords / radius change ──────
  useEffect(() => {
    if (!mapReady || !mapRef.current || !LRef.current) return

    const L   = LRef.current
    const map = mapRef.current

    // Tear down old overlays
    markerRef.current?.remove()
    circleRef.current?.remove()
    markerRef.current = null
    circleRef.current = null

    if (!hasLocation) return

    const latlng = [latitude, longitude]

    // Draggable pin
    const marker = L.marker(latlng, {
      draggable: true,
      icon: L.divIcon({
        className: '',
        iconSize: [22, 22],
        iconAnchor: [11, 11],
        html: '<span class="block h-[22px] w-[22px] rounded-full border-[3px] border-white bg-navy shadow-[0_2px_10px_rgba(0,0,0,0.35)]"></span>',
      }),
    }).addTo(map)
    marker.on('dragend', e => {
      const pos = e.target.getLatLng()
      onChange({
        latitude:  parseFloat(pos.lat.toFixed(6)),
        longitude: parseFloat(pos.lng.toFixed(6)),
      })
    })
    markerRef.current = marker

    // Geofence radius circle
    if (Number.isFinite(radiusMeters) && radiusMeters > 0) {
      circleRef.current = L.circle(latlng, {
        radius:      radiusMeters,
        color:       '#032D57',
        fillColor:   '#032D57',
        fillOpacity: 0.10,
        weight:      2,
        dashArray:   '5 5',
      }).addTo(map)
    }

    // Pan to new pin only if it is far from the current viewport center
    const dist = map.distance(map.getCenter(), latlng)
    if (dist > 300) {
      map.setView(latlng, PINNED_ZOOM)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapReady, hasLocation, latitude, longitude, radiusMeters])

  // ── No office selected guard ───────────────────────────────────────────
  if (!officeId) {
    return (
      <div className="flex h-[340px] items-center justify-center rounded-[1.5rem] border border-black/5 bg-stone-100 text-sm text-muted">
        Select an office to configure its location
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-[1.5rem] border border-black/5 bg-white shadow-sm">

      {/* Map canvas */}
      <div className="relative">
        <div
          ref={containerRef}
          className="bg-stone-100"
          style={{
            height: 340,
            width: '100%',
            backgroundImage: 'linear-gradient(rgba(3,45,87,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(3,45,87,0.08) 1px, transparent 1px)',
            backgroundSize: '28px 28px',
          }}
        />

        {/* Loading skeleton shown until Leaflet boots */}
        {!mapReady && (
          <div className="absolute inset-0 flex items-center justify-center bg-stone-100">
            <div className="flex items-center gap-2 text-sm text-muted">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-navy border-t-transparent" />
              Loading map...
            </div>
          </div>
        )}

        {/* Hint banner — sits above Leaflet controls (z-[1000]) */}
        {mapReady && (
          <div className="pointer-events-none absolute bottom-8 left-1/2 z-[1000] -translate-x-1/2 whitespace-nowrap rounded-full bg-navy/80 px-4 py-1.5 text-xs font-medium text-white backdrop-blur">
            Click map to place pin - drag pin to reposition
          </div>
        )}
      </div>

      {/* Coordinate readout strip */}
      <div className="border-t border-black/5 bg-stone-50 px-4 py-2.5">
        {hasLocation ? (
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs">
            <span className="text-muted">
              <span className="font-semibold text-ink">Lat </span>
              {latitude.toFixed(6)}
            </span>
            <span className="text-muted">
              <span className="font-semibold text-ink">Lng </span>
              {longitude.toFixed(6)}
            </span>
            {Number.isFinite(radiusMeters) && radiusMeters > 0 && (
              <span className="text-muted">
                <span className="font-semibold text-ink">Radius </span>
                {radiusMeters} m
              </span>
            )}
          </div>
        ) : (
          <span className="text-xs text-muted">No pin placed yet - click the map to set a location</span>
        )}
      </div>
    </div>
  )
}
