'use client'

import { useEffect, useMemo, useState, useRef } from 'react'
import { Circle, MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet'
import { divIcon } from 'leaflet'

const DEFAULT_CENTER = [6.3358, 124.7741]

export default function OfficeLocationPicker({
  latitude,
  longitude,
  radiusMeters,
  onChange,
  highlightPin = false,
  officeId,
}) {
  const mapRef = useRef(null)
  
  const center = useMemo(() => (
    Number.isFinite(latitude) && Number.isFinite(longitude)
      ? [latitude, longitude]
      : DEFAULT_CENTER
  ), [latitude, longitude])

  const markerIcon = useMemo(() => divIcon({
    className: `office-map-marker${highlightPin ? ' office-map-marker-pulse' : ''}`,
    html: '<span></span>',
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  }), [highlightPin])

  if (!officeId) {
    return (
      <div className="flex h-[320px] items-center justify-center rounded-[1.5rem] border border-black/5 bg-stone-100 text-sm text-muted">
        Select an office to configure location
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-[1.5rem] border border-black/5 bg-stone-100">
      <MapContainer 
        key={`map-${officeId}`}
        center={center} 
        className="h-[320px] w-full" 
        scrollWheelZoom 
        zoom={15}
        whenCreated={(map) => { mapRef.current = map }}
      >
        <TileLayer
          attribution='&copy; OpenStreetMap contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <MapViewport center={center} />
        <MapClickHandler onChange={onChange} />
        {Number.isFinite(latitude) && Number.isFinite(longitude) ? (
          <>
            <Marker icon={markerIcon} position={[latitude, longitude]} />
            <Circle
              center={[latitude, longitude]}
              pathOptions={{ color: '#0c6c58', fillColor: '#0c6c58', fillOpacity: 0.12 }}
              radius={Number(radiusMeters) || 50}
            />
          </>
        ) : null}
      </MapContainer>
    </div>
  )
}

function MapViewport({ center }) {
  const map = useMap()

  useEffect(() => {
    map.setView(center, map.getZoom(), { animate: true })
    window.setTimeout(() => map.invalidateSize(), 100)
  }, [center, map])

  return null
}

function MapClickHandler({ onChange }) {
  useMapEvents({
    click(event) {
      onChange({
        latitude: Number(event.latlng.lat.toFixed(6)),
        longitude: Number(event.latlng.lng.toFixed(6)),
      })
    },
  })

  return null
}

