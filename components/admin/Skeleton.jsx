export function SkeletonLine({ className = '' }) {
  return (
    <div className={`animate-pulse rounded bg-stone-200 ${className}`} />
  )
}

export function SkeletonCard({ className = '' }) {
  return (
    <div className={`rounded-[1.5rem] border border-black/5 bg-white/80 p-5 shadow-glow backdrop-blur ${className}`}>
      <div className="space-y-3">
        <SkeletonLine className="h-4 w-1/3" />
        <SkeletonLine className="h-8 w-2/3" />
        <SkeletonLine className="h-3 w-full" />
        <SkeletonLine className="h-3 w-5/6" />
      </div>
    </div>
  )
}

export function SkeletonTable({ rows = 5, cols = 4 }) {
  return (
    <div className="overflow-hidden rounded-[1.5rem] border border-black/5 bg-white/80 shadow-glow backdrop-blur">
      <table className="min-w-full text-left text-sm">
        <thead className="bg-stone-50 text-xs uppercase tracking-[0.16em] text-muted">
          <tr>
            {Array.from({ length: cols }).map((_, i) => (
              <th key={i} className="px-5 py-4">
                <SkeletonLine className="h-3 w-16" />
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-black/5">
          {Array.from({ length: rows }).map((_, rowIdx) => (
            <tr key={rowIdx}>
              {Array.from({ length: cols }).map((_, colIdx) => (
                <td key={colIdx} className="px-5 py-4">
                  <SkeletonLine className="h-4 w-24" />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function SkeletonMetricCard() {
  return (
    <div className="rounded-[1.5rem] border border-black/5 bg-white/80 p-5 shadow-glow backdrop-blur">
      <SkeletonLine className="h-3 w-20" />
      <SkeletonLine className="mt-3 h-8 w-12" />
      <SkeletonLine className="mt-2 h-4 w-24" />
    </div>
  )
}

export function SkeletonEmployeeRow() {
  return (
    <div className="flex items-center gap-4 border-b border-black/5 px-5 py-4">
      <SkeletonLine className="h-10 w-10 rounded-full" />
      <div className="flex-1 space-y-2">
        <SkeletonLine className="h-4 w-32" />
        <SkeletonLine className="h-3 w-24" />
      </div>
      <SkeletonLine className="h-6 w-20 rounded-full" />
    </div>
  )
}
