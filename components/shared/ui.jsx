import { useAdminStore } from '@/lib/admin/store'
import { Toast } from '@/components/ui'

export function ToastContainer() {
  const toasts = useAdminStore((s) => s.toasts)
  const removeToast = useAdminStore((s) => s.removeToast)

  if (toasts.length === 0) return null

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {toasts.map((toast) => (
        <Toast
          key={toast.id}
          onDismiss={() => removeToast(toast.id)}
          tone={toast.type === 'success' || toast.type === 'error' ? toast.type : 'neutral'}
        >
          {toast.message}
        </Toast>
      ))}
    </div>
  )
}
