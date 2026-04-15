import { create } from 'zustand'
import { formatAttendanceDateKey, formatAttendanceDateLabel } from '@/lib/attendance-time'

const EMPLOYEE_PAGE_SIZE = 24

let toastIdCounter = 0

export const useAdminStore = create((set, get) => ({
  // ── Session ───────────────────────────────────────────────────────────────
  roleScope: 'regional',
  setRoleScope: (scope) => set({ roleScope: scope }),

  // ── UI State ─────────────────────────────────────────────────────────────
  activePanel: 'dashboard',
  setActivePanel: (panel) => set({ activePanel: panel }),

  pendingActions: new Set(),
  isPending: (key) => get().pendingActions.has(key),
  setPending: (key, pending) => set((state) => {
    const next = new Set(state.pendingActions)
    pending ? next.add(key) : next.delete(key)
    return { pendingActions: next }
  }),

  // ── Toast Notifications ───────────────────────────────────────────────────
  toasts: [],
  addToast: (message, type = 'info', duration = 4000) => {
    const id = `${Date.now()}-${++toastIdCounter}`
    set((state) => ({ toasts: [...state.toasts, { id, message, type }] }))
    setTimeout(() => {
      set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }))
    }, duration)
  },
  removeToast: (id) => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),

  // ── Offices ──────────────────────────────────────────────────────────────
  offices: [],
  officesLoaded: false,
  selectedOfficeId: '',
  setOffices: (offices) => set({ offices, officesLoaded: true }),
  setSelectedOfficeId: (id) => set({ selectedOfficeId: id }),
  getSelectedOffice: () => {
    const { offices, selectedOfficeId } = get()
    return offices.find((o) => o.id === selectedOfficeId) || null
  },
  getVisibleOffices: () => {
    const { offices, roleScope, selectedOfficeId } = get()
    return roleScope === 'regional' ? offices : offices.filter((o) => o.id === selectedOfficeId)
  },

  // ── Office Draft ─────────────────────────────────────────────────────────
  draftOffice: null,
  officeDraftWarning: '',
  locationLoading: false,
  locationNotice: '',
  highlightLocationPin: false,
  setDraftOffice: (office) => set({ draftOffice: office }),
  setOfficeDraftWarning: (msg) => set({ officeDraftWarning: msg }),
  setLocationLoading: (v) => set({ locationLoading: v }),
  setLocationNotice: (msg) => set({ locationNotice: msg }),
  setHighlightLocationPin: (v) => set({ highlightLocationPin: v }),
  updateDraft: (path, value) => set((state) => {
    const base = state.draftOffice || get().getSelectedOffice()
    if (!base) return state
    const parts = path.split('.')
    let next = { ...base }
    if (parts.length === 1) next[parts[0]] = value
    else if (parts.length === 2) next = { ...next, [parts[0]]: { ...base[parts[0]], [parts[1]]: value } }
    else if (parts.length === 3) {
      next = {
        ...next,
        [parts[0]]: {
          ...base[parts[0]],
          [parts[1]]: { ...(base[parts[0]]?.[parts[1]] || {}), [parts[2]]: value },
        },
      }
    }
    return { draftOffice: next, officeDraftWarning: 'You have unsaved changes.' }
  }),
  toggleDay: (field, day) => set((state) => {
    const base = state.draftOffice || get().getSelectedOffice()
    if (!base) return state
    const current = base.workPolicy?.[field] || []
    const next = current.includes(day) ? current.filter((d) => d !== day) : [...current, day]
    return {
      draftOffice: { ...base, workPolicy: { ...base.workPolicy, [field]: next } },
      officeDraftWarning: 'You have unsaved changes.',
    }
  }),
  clearDraft: () => set({ draftOffice: null, officeDraftWarning: '' }),

  // ── Employees ─────────────────────────────────────────────────────────────
  employees: [],
  employeesLoaded: false,
  employeeQuery: '',
  employeeOfficeFilter: 'all',
  employeeStatusFilter: 'all',
  employeeApprovalFilter: 'all',
  employeeCursor: '',
  employeeHistory: [],
  employeeHasMore: false,
  employeeTotal: 0,
  employeeApprovedCount: 0,
  employeePendingCount: 0,
  employeeRejectedCount: 0,
  employeeRefreshKey: 0,
  setEmployees: (data) => set({
    employees: data.persons || [],
    employeesLoaded: true,
    employeeHasMore: data.page?.hasMore || false,
    employeeCursor: data.page?.nextCursor || '',
    employeeTotal: data.page?.total || 0,
    employeeApprovedCount: data.page?.approved || 0,
    employeePendingCount: data.page?.pending || 0,
    employeeRejectedCount: data.page?.rejected || 0,
  }),
  setEmployeesLoaded: (v) => set({ employeesLoaded: v }),
  setEmployeeQuery: (q) => set({ employeeQuery: q, employeeCursor: '', employeeHistory: [] }),
  setEmployeeOfficeFilter: (v) => set({ employeeOfficeFilter: v, employeeCursor: '', employeeHistory: [] }),
  setEmployeeStatusFilter: (v) => set({ employeeStatusFilter: v, employeeCursor: '', employeeHistory: [] }),
  setEmployeeApprovalFilter: (v) => set({ employeeApprovalFilter: v, employeeCursor: '', employeeHistory: [] }),
  setEmployeeCursor: (cursor, addToHistory = false) => set((state) => ({
    employeeCursor: cursor,
    employeeHistory: addToHistory ? [...state.employeeHistory, state.employeeCursor] : state.employeeHistory,
  })),
  refreshEmployees: () => set((state) => ({ employeeRefreshKey: state.employeeRefreshKey + 1, employeeCursor: '', employeeHistory: [] })),
  goToPreviousPage: () => set((state) => {
    const nextHistory = [...state.employeeHistory]
    const prevCursor = nextHistory.pop() || ''
    return { employeeCursor: prevCursor, employeeHistory: nextHistory }
  }),

  // ── Attendance ────────────────────────────────────────────────────────────
  attendance: [],
  attendanceLoaded: false,
  setAttendance: (data) => set({ attendance: data.attendance || [], attendanceLoaded: true }),
  setAttendanceLoaded: (v) => set({ attendanceLoaded: v }),
  getTodaysLogs: () => {
    const { attendance, roleScope, selectedOfficeId } = get()
    const todayKey = formatAttendanceDateKey(Date.now())
    const todayLabel = formatAttendanceDateLabel(Date.now())
    return attendance.filter((e) => {
      const matchScope = roleScope === 'regional' || e.officeId === selectedOfficeId
      return matchScope && (e.dateKey === todayKey || e.date === todayLabel)
    })
  },

  // ── Admins ───────────────────────────────────────────────────────────────
  admins: [],
  adminsLoaded: false,
  setAdmins: (data) => set({ admins: data.admins || [], adminsLoaded: true }),
  setAdminsLoaded: (v) => set({ adminsLoaded: v }),
  addAdmin: (admin) => set((state) => ({ admins: [...state.admins, admin] })),
  updateAdmin: (id, updates) => set((state) => ({
    admins: state.admins.map((a) => (a.id === id ? { ...a, ...updates } : a)),
  })),
  removeAdmin: (id) => set((state) => ({ admins: state.admins.filter((a) => a.id !== id) })),

  // ── Summary ───────────────────────────────────────────────────────────────
  todayIso: formatAttendanceDateKey(Date.now()),
  summaryDate: formatAttendanceDateKey(Date.now()),
  summaryOfficeFilter: 'all',
  summaryEmployeeFilter: 'all',
  summaryRows: [],
  summaryLoading: false,
  setSummaryDate: (d) => set({ summaryDate: d }),
  setSummaryOfficeFilter: (v) => set({ summaryOfficeFilter: v }),
  setSummaryEmployeeFilter: (v) => set({ summaryEmployeeFilter: v }),
  setSummaryRows: (rows) => set((state) => {
    let filtered = rows || []
    if (state.summaryEmployeeFilter !== 'all') {
      filtered = filtered.filter((r) => r.employeeId === state.summaryEmployeeFilter)
    }
    return { summaryRows: filtered }
  }),
  setSummaryLoading: (v) => set({ summaryLoading: v }),
  getSummaryEmployeeOptions: () => {
    const { summaryRows } = get()
    const seen = new Set()
    return summaryRows
      .filter((r) => !seen.has(r.employeeId) && seen.add(r.employeeId))
      .map((r) => ({ employeeId: r.employeeId, name: r.name }))
  },

  // ── Employee Editor Modal ─────────────────────────────────────────────────
  editingEmployee: null,
  setEditingEmployee: (p) => set({ editingEmployee: p }),
  deletingEmployee: null,
  setDeletingEmployee: (p) => set({ deletingEmployee: p }),

  // ── System ───────────────────────────────────────────────────────────────
  firestoreIndexSummary: null,
  setFirestoreIndexSummary: (s) => set({ firestoreIndexSummary: s }),
  setSummaryIndexSummary: (s) => set({ firestoreIndexSummary: s }),

  // ── Computed ─────────────────────────────────────────────────────────────
  getEmployeeMetric: () => {
    const { employeesLoaded, employeeTotal, roleScope, offices, selectedOfficeId } = get()
    if (employeesLoaded) return String(employeeTotal).padStart(2, '0')
    if (roleScope === 'regional') {
      return String(offices.reduce((t, o) => t + Number(o.employees || 0), 0)).padStart(2, '0')
    }
    const base = offices.find((o) => o.id === selectedOfficeId)
    return String(Number(base?.employees || 0)).padStart(2, '0')
  },
}))
