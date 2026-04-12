'use client'

import { useMemo, useState } from 'react'

const DEFAULT_CENTER = [6.3358, 124.7741]

export default function OfficeLocationPicker({
  latitude,
  longitude,
  radiusMeters,
  onChange,
  highlightPin = false,
  officeId,
}) {
  const [manualLat, setManualLat] = useState('')
  const [manualLng, setManualLng] = useState('')

  const hasLocation = Number.isFinite(latitude) && Number.isFinite(longitude)

  const mapEmbedUrl = useMemo(() => {
    if (!hasLocation) return null
    const lat = latitude.toFixed(5)
    const lng = longitude.toFixed(5)
    return `https://www.openstreetmap.org/export/embed.html?bbox=${Number(lng)-0.01}%2C${Number(lat)-0.01}%2C${Number(lng)+0.01}%2C${Number(lat)+0.01}&layer=mapnik&marker=${lat}%2C${lng}`
  }, [hasLocation, latitude, longitude])

  const handleUseMyLocation = () => {
    if (!navigator.geolocation) return
    
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        onChange({
          latitude: Number(pos.coords.latitude.toFixed(6)),
          longitude: Number(pos.coords.longitude.toFixed(6)),
        })
      },
      (err) => console.error('Geolocation error:', err),
      { enableHighAccuracy: true }
    )
  }

  const handleManualSubmit = (e) => {
    e.preventDefault()
    const lat = parseFloat(manualLat)
    const lng = parseFloat(manualLng)
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      onChange({ latitude: lat, longitude: lng })
    }
  }

  if (!officeId) {
    return (
      <div className="flex h-[320px] items-center justify-center rounded-[1.5rem] border border-black/5 bg-stone-100 text-sm text-muted">
        Select an office to configure location
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-[1.5rem] border border-black/5 bg-stone-100">
      {mapEmbedUrl ? (
        <iframe
          title="Office Location"
          width="100%"
          height="320"
          frameBorder="0"
          src={mapEmbedUrl}
          className="w-full"
        />
      ) : (
        <div className="flex h-[320px] items-center justify-center bg-stone-100 text-muted">
          No location set - enter coordinates below
        </div>
      )}
      
      <div className="p-4 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-muted mb-1">
              Latitude
            </label>
            <input
              type="number"
              step="0.000001"
              value={hasLocation ? latitude.toFixed(6) : ''}
              onChange={(e) => {
                const val = parseFloat(e.target.value)
                if (Number.isFinite(val)) {
                  onChange({ latitude: val, longitude: longitude || 0 })
                }
              }}
              className="w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm font-mono"
              placeholder="7.22310"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-muted mb-1">
              Longitude
            </label>
            <input
              type="number"
              step="0.000001"
              value={hasLocation ? longitude.toFixed(6) : ''}
              onChange={(e) => {
                const val = parseFloat(e.target.value)
                if (Number.isFinite(val)) {
                  onChange({ latitude: latitude || 0, longitude: val })
                }
              }}
              className="w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm font-mono"
              placeholder="124.24520"
            />
          </div>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleUseMyLocation}
            className="flex-1 rounded-xl border border-black/10 bg-white px-4 py-2 text-sm font-semibold text-ink transition hover:bg-stone-50"
          >
            📍 Use My Location
          </button>
        </div>

        {hasLocation && (
          <div className="text-xs text-muted bg-stone-50 p-2 rounded-lg">
            <strong>Current:</strong> {latitude.toFixed(5)}, {longitude.toFixed(5)}
            {radiusMeters && <span> • Radius: {radiusMeters}m</span>}
          </div>
        )}
      </div>
    </div>
  )
}