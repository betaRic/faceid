export function createAdminsSlice(set) {
  return {
    admins: [],
    adminsLoaded: false,
    setAdmins: (data) => set({ admins: data.admins || [], adminsLoaded: true }),
    setAdminsLoaded: (value) => set({ adminsLoaded: value }),
    addAdmin: (admin) => set((state) => ({ admins: [...state.admins, admin] })),
    updateAdmin: (id, updates) => set((state) => ({
      admins: state.admins.map((admin) => (admin.id === id ? { ...admin, ...updates } : admin)),
    })),
    removeAdmin: (id) => set((state) => ({
      admins: state.admins.filter((admin) => admin.id !== id),
    })),
  }
}
