export function createOfficesSlice(set, get) {
  return {
    offices: [],
    officesLoaded: false,
    selectedOfficeId: '',
    setOffices: (offices) => set({ offices, officesLoaded: true }),
    setSelectedOfficeId: (id) => set({ selectedOfficeId: id }),
    getSelectedOffice: () => {
      const { offices, selectedOfficeId } = get()
      return offices.find((office) => office.id === selectedOfficeId) || null
    },
    getVisibleOffices: () => {
      const { offices, roleScope, selectedOfficeId } = get()
      return roleScope === 'regional'
        ? offices
        : offices.filter((office) => office.id === selectedOfficeId)
    },

    draftOffice: null,
    officeDraftWarning: '',
    locationLoading: false,
    locationNotice: '',
    highlightLocationPin: false,
    setDraftOffice: (office) => set({ draftOffice: office }),
    setOfficeDraftWarning: (message) => set({ officeDraftWarning: message }),
    setLocationLoading: (value) => set({ locationLoading: value }),
    setLocationNotice: (message) => set({ locationNotice: message }),
    setHighlightLocationPin: (value) => set({ highlightLocationPin: value }),
    updateDraft: (path, value) => set((state) => {
      const base = state.draftOffice || get().getSelectedOffice()
      if (!base) return state

      const parts = path.split('.')
      let next = { ...base }

      if (parts.length === 1) {
        next[parts[0]] = value
      } else if (parts.length === 2) {
        next = {
          ...next,
          [parts[0]]: {
            ...base[parts[0]],
            [parts[1]]: value,
          },
        }
      } else if (parts.length === 3) {
        next = {
          ...next,
          [parts[0]]: {
            ...base[parts[0]],
            [parts[1]]: {
              ...(base[parts[0]]?.[parts[1]] || {}),
              [parts[2]]: value,
            },
          },
        }
      }

      return {
        draftOffice: next,
        officeDraftWarning: 'You have unsaved changes.',
      }
    }),
    toggleDay: (field, day) => set((state) => {
      const base = state.draftOffice || get().getSelectedOffice()
      if (!base) return state

      const current = base.workPolicy?.[field] || []
      const next = current.includes(day)
        ? current.filter((value) => value !== day)
        : [...current, day]

      return {
        draftOffice: {
          ...base,
          workPolicy: {
            ...base.workPolicy,
            [field]: next,
          },
        },
        officeDraftWarning: 'You have unsaved changes.',
      }
    }),
    addDivision: () => set((state) => {
      const base = state.draftOffice || get().getSelectedOffice()
      if (!base) return state
      const divisions = Array.isArray(base.divisions) ? base.divisions : []
      return {
        draftOffice: {
          ...base,
          divisions: [...divisions, { id: '', shortName: '', name: '', headName: '', headPosition: '' }],
        },
        officeDraftWarning: 'You have unsaved changes.',
      }
    }),
    updateDivision: (index, field, value) => set((state) => {
      const base = state.draftOffice || get().getSelectedOffice()
      if (!base) return state
      const divisions = Array.isArray(base.divisions) ? base.divisions : []
      if (index < 0 || index >= divisions.length) return state
      const next = divisions.map((division, i) => i === index ? { ...division, [field]: value } : division)
      return {
        draftOffice: { ...base, divisions: next },
        officeDraftWarning: 'You have unsaved changes.',
      }
    }),
    removeDivision: (index) => set((state) => {
      const base = state.draftOffice || get().getSelectedOffice()
      if (!base) return state
      const divisions = Array.isArray(base.divisions) ? base.divisions : []
      if (index < 0 || index >= divisions.length) return state
      return {
        draftOffice: { ...base, divisions: divisions.filter((_, i) => i !== index) },
        officeDraftWarning: 'You have unsaved changes.',
      }
    }),
    clearDraft: () => set({ draftOffice: null, officeDraftWarning: '' }),
  }
}
