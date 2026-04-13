export default function KioskAlert({ alertState }) {
  if (!alertState) return null

  return (
    <div className="absolute inset-0 z-[5] flex items-center justify-center bg-black/40 px-4 sm:px-6">
      <div className="w-full max-w-sm rounded-[1.25rem] bg-white px-5 py-5 text-center shadow-2xl sm:rounded-[1.5rem] sm:px-6 sm:py-6">
        <div className="text-sm font-semibold uppercase tracking-[0.18em] text-warn">Scan result</div>
        <div className="mt-3 text-base font-semibold text-ink sm:text-lg">{alertState}</div>
      </div>
    </div>
  )
}