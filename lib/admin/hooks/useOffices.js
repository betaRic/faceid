import { useCallback, useEffect, useRef, useState } from 'react'
import { useAdminStore } from '../store'
import { subscribeToOfficeConfigs } from '@/lib/office-admin-store'
import { createOfficeConfig, deleteOfficeConfig, saveOfficeConfig } from '@/lib/office-admin-store'
import { normalizeOfficeRecord } from '@/lib/offices'

function buildEmptyOffice() {
  return normalizeOfficeRecord({
    id: '',
    code: '',
    name: '',
    shortName: '',
    officeType: 'Provincial Office',
    location: '',
    provinceOrCity: '',
    status: 'active',
    employees: 0,
    gps: {
      latitude: 6.221,
      longitude: 124.246,
      radiusMeters: 150,
    },
    workPolicy: {
      schedule: 'Mon-Fri, 8:00 AM to 5:00 PM',
      workingDays: [1, 2, 3, 4, 5],
      wfhDays: [],
      morningIn: '08:00',
      morningOut: '12:00',
      afternoonIn: '13:00',
      afternoonOut: '17:00',
      gracePeriodMinutes: 10,
      checkInCooldownMinutes: 30,
      checkOutCooldownMinutes: 5,
    },
  })
}

export function useOffices() {
  const store = useAdminStore()
  const locationPulseRef = useRef(null)
  const locationNoticeRef = useRef(null)
  const [initialLoadAttempted, setInitialLoadAttempted] = useState(false)

  useEffect(() => {
    const unsub = subscribeToOfficeConfigs(
      (nextOffices) => {
        store.setOffices(nextOffices)
        setInitialLoadAttempted(true)
        if (!store.selectedOfficeId && nextOffices.length > 0) {
          store.setSelectedOfficeId(nextOffices[0].id)
        }
      },
      (err) => {
        console.error('Office load error:', err)
        setInitialLoadAttempted(true)
        store.addToast(err?.message || 'Failed to load offices', 'error')
      },
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
      const creating = !store.draftOffice.id || !store.offices.some(office => office.id === store.draftOffice.id)
      const result = creating
        ? await createOfficeConfig(store.draftOffice)
        : await saveOfficeConfig(store.draftOffice)
      const nextOffices = creating
        ? [...store.offices, result.office]
        : store.offices.map(office => (office.id === result.office.id ? result.office : office))
      store.setOffices(nextOffices)
      store.setSelectedOfficeId(result.office.id)
      store.clearDraft()
      store.addToast(creating ? 'Office created' : 'Office saved', 'success')
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

  const handleStartCreateOffice = useCallback(() => {
    store.setDraftOffice(buildEmptyOffice())
    store.setOfficeDraftWarning('')
  }, [])

  const handleStartEditOffice = useCallback((officeId) => {
    const office = store.offices.find(entry => entry.id === officeId)
    if (!office) return
    store.setSelectedOfficeId(officeId)
    store.setDraftOffice(normalizeOfficeRecord(office))
    store.setOfficeDraftWarning('')
  }, [store.offices, store.setSelectedOfficeId])

  const handleCancelOfficeEditor = useCallback(() => {
    store.clearDraft()
  }, [])

  const handleDeleteOffice = useCallback(async officeId => {
    store.setPending('office-delete', true)
    try {
      await deleteOfficeConfig(officeId)
      const nextOffices = store.offices.filter(office => office.id !== officeId)
      store.setOffices(nextOffices)
      if (store.selectedOfficeId === officeId) {
        store.setSelectedOfficeId(nextOffices[0]?.id || '')
      }
      store.clearDraft()
      store.addToast('Office deleted', 'success')
    } catch (error) {
      store.addToast(error?.message || 'Failed to delete office', 'error')
    }
    store.setPending('office-delete', false)
  }, [store.offices, store.selectedOfficeId])

  return {
    offices: store.offices,
    officesLoaded: store.officesLoaded,
    selectedOfficeId: store.selectedOfficeId,
    setSelectedOfficeId: store.setSelectedOfficeId,
    visibleOffices: store.getVisibleOffices(),
    selectedOffice: store.getSelectedOffice(),
    activeOffice: store.draftOffice || store.getSelectedOffice(),
    draftOffice: store.draftOffice,
    officeDraftWarning: store.officeDraftWarning,
    locationLoading: store.locationLoading,
    locationNotice: store.locationNotice,
    highlightLocationPin: store.highlightLocationPin,
    savePending: store.isPending('office-save'),
    updateDraft: store.updateDraft,
    toggleDay: store.toggleDay,
    handleSaveOffice,
    handleStartCreateOffice,
    handleStartEditOffice,
    handleCancelOfficeEditor,
    handleDeleteOffice,
    handleUseMyLocation,
    deletePending: store.isPending('office-delete'),
  }
}
