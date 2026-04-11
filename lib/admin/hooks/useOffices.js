import { useCallback, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useAdminStore } from '../store'
import { subscribeToOfficeConfigs } from '@/lib/office-admin-store'
import { saveOfficeConfig } from '@/lib/office-admin-store'

export function useOffices() {
  const store = useAdminStore()
  const locationPulseRef = useRef(null)
  const locationNoticeRef = useRef(null)

  useEffect(() => {
    const unsub = subscribeToOfficeConfigs(
      (nextOffices) => {
        store.setOffices(nextOffices)
        if (!store.selectedOfficeId && nextOffices.length > 0) {
          store.setSelectedOfficeId(nextOffices[0].id)
        }
      },
      (err) => store.addToast(err?.message || 'Failed to load offices', 'error'),
    )
    return unsub
  }, [])

  useEffect(() => {
    store.clearDraft()
  }, [store.selectedOfficeId])

  const handleSaveOffice = useCallback(async () => {
    if (!store.draftOffice) return
    store.setPending('office-save', true)
    try {
      const result = await saveOfficeConfig(store.draftOffice)
      store.setOffices(store.offices.map((o) => (o.id === result.office.id ? result.office : o)))
      store.clearDraft()
      store.addToast('Office saved', 'success')
      store.setHighlightLocationPin(true)
      if (locationPulseRef.current) clearTimeout(locationPulseRef.current)
      locationPulseRef.current = setTimeout(() => store.setHighlightLocationPin(false), 2500)
    } catch (err) {
      store.setOfficeDraftWarning(err?.message || 'Failed to save office')
    }
    store.setPending('office-save', false)
  }, [store.draftOffice])

  const handleUseMyLocation = useCallback(() => {
    store.setLocationLoading(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        store.updateDraft('gps.latitude', Number(pos.coords.latitude.toFixed(6)))
        store.updateDraft('gps.longitude', Number(pos.coords.longitude.toFixed(6)))
        store.setLocationNotice(`Set to ${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)}`)
        store.setHighlightLocationPin(true)
        store.setLocationLoading(false)
        if (locationNoticeRef.current) clearTimeout(locationNoticeRef.current)
        locationNoticeRef.current = setTimeout(() => store.setLocationNotice(''), 4000)
      },
      (err) => {
        store.setLocationNotice('Could not get location: ' + (err?.message || 'Unknown error'))
        store.setLocationLoading(false)
        if (locationNoticeRef.current) clearTimeout(locationNoticeRef.current)
        locationNoticeRef.current = setTimeout(() => store.setLocationNotice(''), 4000)
      },
      { enableHighAccuracy: true, timeout: 10000 },
    )
  }, [])

  return {
    offices: store.offices,
    selectedOfficeId: store.selectedOfficeId,
    setSelectedOfficeId: store.setSelectedOfficeId,
    visibleOffices: store.getVisibleOffices(),
    activeOffice: store.draftOffice || store.getSelectedOffice(),
    draftOffice: store.draftOffice,
    officeDraftWarning: store.officeDraftWarning,
    locationLoading: store.locationLoading,
    locationNotice: store.locationNotice,
    highlightLocationPin: store.highlightLocationPin,
    updateDraft: store.updateDraft,
    toggleDay: store.toggleDay,
    handleSaveOffice,
    handleUseMyLocation,
  }
}
