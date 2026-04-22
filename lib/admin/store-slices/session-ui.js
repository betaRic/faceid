let toastIdCounter = 0

export function createSessionUiSlice(set, get) {
  return {
    roleScope: 'regional',
    setRoleScope: (scope) => set({ roleScope: scope }),

    activePanel: 'dashboard',
    setActivePanel: (panel) => set({ activePanel: panel }),

    pendingActions: new Set(),
    isPending: (key) => get().pendingActions.has(key),
    setPending: (key, pending) => set((state) => {
      const next = new Set(state.pendingActions)
      if (pending) next.add(key)
      else next.delete(key)
      return { pendingActions: next }
    }),

    toasts: [],
    addToast: (message, type = 'info', duration = 4000) => {
      const id = `${Date.now()}-${++toastIdCounter}`
      set((state) => ({ toasts: [...state.toasts, { id, message, type }] }))
      setTimeout(() => {
        set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) }))
      }, duration)
    },
    removeToast: (id) => set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) })),

    editingEmployee: null,
    setEditingEmployee: (person) => set({ editingEmployee: person }),
    deletingEmployee: null,
    setDeletingEmployee: (person) => set({ deletingEmployee: person }),
  }
}
