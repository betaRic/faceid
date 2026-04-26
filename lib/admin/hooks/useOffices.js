import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useShallow } from 'zustand/react/shallow'
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
    headName: '',
    headPosition: '',
    divisions: [],
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

function validateOfficeDraft(office) {
  if (!office?.name?.trim()) return 'Office name is required.'
  if (!office?.officeType?.trim()) return 'Office type is required.'
  if (!office?.location?.trim()) return 'Location label is required.'
  if (!office?.provinceOrCity?.trim()) return 'Province or city is required.'
  if (!office?.headName?.trim()) return 'Office head name is required.'
  if (!office?.headPosition?.trim()) return 'Office head position is required.'
  if (!office?.workPolicy?.schedule?.trim()) return 'Schedule label is required.'
  if (!Array.isArray(office?.workPolicy?.workingDays) || office.workPolicy.workingDays.length === 0) {
    return 'Choose at least one working day.'
  }
  if (String(office.officeType).trim() === 'Regional Office') {
    const divisions = Array.isArray(office?.divisions) ? office.divisions : []
    if (divisions.length === 0) {
      return 'Regional offices must define at least one division or unit.'
    }
    for (const division of divisions) {
      if (!division?.shortName?.trim() || !division?.name?.trim()) {
        return 'Each division must have a short name and a full name.'
      }
      if (!division?.headName?.trim() || !division?.headPosition?.trim()) {
        return `Division ${division.shortName || division.name} requires a head name and position.`
      }
    }
  }

  const latitude = Number(office?.gps?.latitude)
  const longitude = Number(office?.gps?.longitude)
  const radiusMeters = Number(office?.gps?.radiusMeters)

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || !Number.isFinite(radiusMeters)) {
    return 'Valid GPS coordinates and radius are required.'
  }

  if (radiusMeters <= 0) {
    return 'Office radius must be greater than zero.'
  }

  const wp = office?.workPolicy || {}
  if (!wp.morningIn || !wp.morningOut || !wp.afternoonIn || !wp.afternoonOut) {
    return 'Complete all session times before saving.'
  }

  if (wp.morningIn >= wp.morningOut) {
    return 'AM check-out must be later than AM check-in.'
  }

  if (wp.afternoonIn >= wp.afternoonOut) {
    return 'PM check-out must be later than PM check-in.'
  }

  return ''
}

export function useOffices(shouldSubscribe = false) {
  const store = useAdminStore(useShallow((state) => ({
    offices: state.offices,
    officesLoaded: state.officesLoaded,
    selectedOfficeId: state.selectedOfficeId,
    roleScope: state.roleScope,
    draftOffice: state.draftOffice,
    officeDraftWarning: state.officeDraftWarning,
    officeDraftDirty: state.officeDraftDirty,
    locationLoading: state.locationLoading,
    locationNotice: state.locationNotice,
    highlightLocationPin: state.highlightLocationPin,
    setOffices: state.setOffices,
    setSelectedOfficeId: state.setSelectedOfficeId,
    setDraftOffice: state.setDraftOffice,
    setOfficeDraftWarning: state.setOfficeDraftWarning,
    setLocationLoading: state.setLocationLoading,
    setLocationNotice: state.setLocationNotice,
    setHighlightLocationPin: state.setHighlightLocationPin,
    updateDraft: state.updateDraft,
    toggleDay: state.toggleDay,
    addDivision: state.addDivision,
    updateDivision: state.updateDivision,
    removeDivision: state.removeDivision,
    clearDraft: state.clearDraft,
    addToast: state.addToast,
    setPending: state.setPending,
    isPending: state.isPending,
  })))
  const locationPulseRef = useRef(null)
  const locationNoticeRef = useRef(null)
  const {
    offices,
    officesLoaded,
    selectedOfficeId,
    roleScope,
    draftOffice,
    officeDraftWarning,
    officeDraftDirty,
    locationLoading,
    locationNotice,
    highlightLocationPin,
    setOffices,
    setSelectedOfficeId,
    setDraftOffice,
    setOfficeDraftWarning,
    setLocationLoading,
    setLocationNotice,
    setHighlightLocationPin,
    updateDraft,
    toggleDay,
    addDivision,
    updateDivision,
    removeDivision,
    clearDraft,
    addToast,
    setPending,
    isPending,
  } = store
  const visibleOffices = useMemo(() => (
    roleScope === 'regional'
      ? offices
      : offices.filter((office) => office.id === selectedOfficeId)
  ), [offices, roleScope, selectedOfficeId])

  const selectedOffice = useMemo(() => (
    offices.find((office) => office.id === selectedOfficeId) || null
  ), [offices, selectedOfficeId])

  useEffect(() => {
    if (!shouldSubscribe) return undefined

    const unsub = subscribeToOfficeConfigs(
      (nextOffices) => {
        setOffices(nextOffices)
        if (!useAdminStore.getState().selectedOfficeId && nextOffices.length > 0) {
          setSelectedOfficeId(nextOffices[0].id)
        }
      },
      (err) => {
        console.error('Office load error:', err)
        addToast(err?.message || 'Failed to load offices', 'error')
      },
    )
    return unsub
  }, [addToast, setOffices, setSelectedOfficeId, shouldSubscribe])

  const handleSaveOffice = useCallback(async () => {
    if (!draftOffice) return

    const validationError = validateOfficeDraft(draftOffice)
    if (validationError) {
      setOfficeDraftWarning(validationError)
      addToast(validationError, 'error')
      return
    }

    setPending('office-save', true)
    try {
      const creating = !draftOffice.id || !offices.some((office) => office.id === draftOffice.id)
      const result = creating
        ? await createOfficeConfig(draftOffice)
        : await saveOfficeConfig(draftOffice)
      const nextOffices = creating
        ? [...offices, result.office]
        : offices.map((office) => (office.id === result.office.id ? result.office : office))
      setOffices(nextOffices)
      setSelectedOfficeId(result.office.id)
      clearDraft()
      addToast(creating ? 'Office created' : 'Office saved', 'success')
      setHighlightLocationPin(true)
      if (locationPulseRef.current) clearTimeout(locationPulseRef.current)
      locationPulseRef.current = setTimeout(() => setHighlightLocationPin(false), 2500)
    } catch (err) {
      setOfficeDraftWarning(err?.message || 'Failed to save office')
    }
    setPending('office-save', false)
  }, [
    addToast,
    clearDraft,
    draftOffice,
    offices,
    setHighlightLocationPin,
    setOfficeDraftWarning,
    setOffices,
    setPending,
    setSelectedOfficeId,
  ])

  const handleUseMyLocation = useCallback(() => {
    setLocationLoading(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        updateDraft('gps.latitude', Number(pos.coords.latitude.toFixed(6)))
        updateDraft('gps.longitude', Number(pos.coords.longitude.toFixed(6)))
        setLocationNotice(`Set to ${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)}`)
        setHighlightLocationPin(true)
        setLocationLoading(false)
        if (locationNoticeRef.current) clearTimeout(locationNoticeRef.current)
        locationNoticeRef.current = setTimeout(() => setLocationNotice(''), 4000)
      },
      (err) => {
        setLocationNotice('Could not get location: ' + (err?.message || 'Unknown error'))
        setLocationLoading(false)
        if (locationNoticeRef.current) clearTimeout(locationNoticeRef.current)
        locationNoticeRef.current = setTimeout(() => setLocationNotice(''), 4000)
      },
      { enableHighAccuracy: true, timeout: 10000 },
    )
  }, [setHighlightLocationPin, setLocationLoading, setLocationNotice, updateDraft])

  const handleStartCreateOffice = useCallback(() => {
    setDraftOffice(buildEmptyOffice())
    setOfficeDraftWarning('')
  }, [setDraftOffice, setOfficeDraftWarning])

  const handleStartEditOffice = useCallback((officeId) => {
    const office = offices.find((entry) => entry.id === officeId)
    if (!office) return
    setSelectedOfficeId(officeId)
    setDraftOffice(normalizeOfficeRecord(office))
    setOfficeDraftWarning('')
  }, [offices, setDraftOffice, setOfficeDraftWarning, setSelectedOfficeId])

  const handleCancelOfficeEditor = useCallback(() => {
    clearDraft()
  }, [clearDraft])

  const handleDeleteOffice = useCallback(async officeId => {
    setPending('office-delete', true)
    try {
      await deleteOfficeConfig(officeId)
      const nextOffices = offices.filter((office) => office.id !== officeId)
      setOffices(nextOffices)
      if (selectedOfficeId === officeId) {
        setSelectedOfficeId(nextOffices[0]?.id || '')
      }
      clearDraft()
      addToast('Office deleted', 'success')
    } catch (error) {
      addToast(error?.message || 'Failed to delete office', 'error')
    }
    setPending('office-delete', false)
  }, [addToast, clearDraft, offices, selectedOfficeId, setOffices, setPending, setSelectedOfficeId])

  return {
    offices,
    officesLoaded,
    selectedOfficeId,
    setSelectedOfficeId,
    visibleOffices,
    selectedOffice,
    activeOffice: draftOffice || selectedOffice,
    draftOffice,
    officeDraftWarning,
    officeDraftDirty,
    locationLoading,
    locationNotice,
    highlightLocationPin,
    savePending: isPending('office-save'),
    updateDraft,
    toggleDay,
    addDivision,
    updateDivision,
    removeDivision,
    handleSaveOffice,
    handleStartCreateOffice,
    handleStartEditOffice,
    handleCancelOfficeEditor,
    handleDeleteOffice,
    handleUseMyLocation,
    deletePending: isPending('office-delete'),
  }
}
