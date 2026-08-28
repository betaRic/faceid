import { Icon } from '@/components/ui'

export default function KioskAlert({ alertState }) {
  if (!alertState) return null

  return (
    <div className="absolute inset-0 z-[5] flex items-center justify-center bg-black/45 px-4 sm:px-6">
      <div className="w-full max-w-sm rounded-surface border border-line bg-surface px-5 py-5 text-center shadow-dialog sm:px-6 sm:py-6" role="alert">
        <Icon className="mx-auto text-warning" name="alert" size={32} />
        <div className="mt-3 text-sm font-semibold text-warning">Scan result</div>
        <div className="mt-2 text-base font-semibold text-foreground sm:text-lg">{alertState}</div>
      </div>
    </div>
  )
}
