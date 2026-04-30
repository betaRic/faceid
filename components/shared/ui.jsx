import { useAdminStore } from '@/lib/admin/store'

export function Field({ label, children, className = '' }) {
  return (
    <label className={`grid gap-2 ${className}`}>
      <span className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">{label}</span>
      {children}
    </label>
  )
}

export function InfoCard({ title, text, tone = 'default' }) {
  const toneClass = tone === 'warn'
    ? 'border-amber-200 bg-amber-50 text-amber-900'
    : 'border-black/5 bg-stone-50 text-muted'

  return (
    <section className={`rounded-[1.5rem] border p-4 ${toneClass}`}>
      <h3 className="text-sm font-semibold uppercase tracking-[0.14em]">{title}</h3>
      <p className="mt-2 text-sm leading-7">{text}</p>
    </section>
  )
}

export function WizardStep({ active, complete, number, title, description }) {
  return (
    <div className={`rounded-[1rem] border px-3 py-2.5 ${complete ? 'border-emerald-200 bg-emerald-50' : active ? 'border-navy/30 bg-navy/8' : 'border-black/5 bg-stone-50'}`}>
      <div className="flex items-center gap-2.5">
        <span className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${complete ? 'bg-emerald-500 text-white' : active ? 'bg-navy text-white' : 'bg-white text-muted'}`}>
          {number}
        </span>
        <div className="min-w-0">
          <div className="text-sm font-semibold text-ink">{title}</div>
          <div className="hidden text-xs leading-5 text-muted xl:block">{description}</div>
        </div>
      </div>
    </div>
  )
}

export function Badge({ children, variant = 'default', className = '' }) {
  const variants = {
    default: 'bg-stone-100 text-stone-700',
    success: 'bg-emerald-100 text-emerald-800',
    warning: 'bg-amber-100 text-amber-800',
    danger: 'bg-red-100 text-red-700',
    info: 'bg-blue-100 text-blue-800',
  }
  return (
    <span className={`inline-flex rounded-full px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.12em] ${variants[variant]} ${className}`}>
      {children}
    </span>
  )
}

export function StatusBadge({ active }) {
  return (
    <Badge variant={active ? 'success' : 'default'}>
      {active ? 'Active' : 'Inactive'}
    </Badge>
  )
}

export function ApprovalBadge({ status }) {
  const variants = {
    approved: 'success',
    pending: 'warning',
    rejected: 'danger',
  }
  return (
    <Badge variant={variants[status] || 'default'}>
      {status || 'Unknown'}
    </Badge>
  )
}

export function ToastContainer() {
  const toasts = useAdminStore((s) => s.toasts)
  const removeToast = useAdminStore((s) => s.removeToast)

  if (toasts.length === 0) return null

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`min-w-[280px] max-w-md rounded-2xl border px-4 py-3 shadow-lg ${
            toast.type === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-900' :
            toast.type === 'error' ? 'border-red-200 bg-red-50 text-red-900' :
            'border-stone-200 bg-white text-stone-900'
          }`}
        >
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-medium">{toast.message}</span>
            <button
              onClick={() => removeToast(toast.id)}
              className="text-xs opacity-60 hover:opacity-100"
              type="button"
            >
              ✕
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
