import { getFaceSizeGuidance } from '@/lib/biometrics/face-size-guidance'

function resolveToneClasses(status, theme) {
  if (theme === 'light') {
    if (status === 'ready') {
      return {
        badge: 'bg-emerald-100 text-emerald-800',
        marker: 'bg-emerald-500 shadow-lg shadow-emerald-500/35',
      }
    }
    if (status === 'not-detected') {
      return {
        badge: 'bg-stone-100 text-muted',
        marker: 'bg-stone-400',
      }
    }
    return {
      badge: 'bg-amber-100 text-amber-900',
      marker: 'bg-amber-500 shadow-lg shadow-amber-500/35',
    }
  }

  if (status === 'ready') {
    return {
      badge: 'bg-emerald-500/80 text-white',
      marker: 'bg-emerald-400 shadow-lg shadow-emerald-400/50',
    }
  }
  if (status === 'not-detected') {
    return {
      badge: 'bg-white/12 text-white/78',
      marker: 'bg-white/70',
    }
  }
  return {
    badge: 'bg-amber-500/80 text-white',
    marker: 'bg-amber-400 shadow-lg shadow-amber-400/50',
  }
}

export default function FaceSizeGuidance({
  guidance,
  faceAreaRatio,
  theme = 'dark',
  compact = false,
  className = '',
}) {
  const resolvedGuidance = guidance || getFaceSizeGuidance(faceAreaRatio)
  const tone = resolveToneClasses(resolvedGuidance.status, theme)

  const shellClass = theme === 'light'
    ? 'border-black/8 bg-white/92 text-ink shadow-sm'
    : 'border-white/20 bg-black/60 text-white backdrop-blur'

  const labelClass = theme === 'light'
    ? 'text-[10px] uppercase tracking-[0.16em] text-muted'
    : 'text-[10px] uppercase tracking-[0.16em] text-white/55'

  const endpointClass = theme === 'light'
    ? 'text-[10px] font-medium text-muted'
    : 'text-[10px] font-medium text-white/50'

  const detailClass = theme === 'light'
    ? 'text-xs text-muted'
    : 'text-xs text-white/72'

  const trackClass = theme === 'light' ? 'bg-stone-100' : 'bg-white/20'
  const leftRangeClass = theme === 'light' ? 'bg-amber-200/90' : 'bg-amber-500/35'
  const middleRangeClass = theme === 'light' ? 'bg-emerald-200/95' : 'bg-emerald-500/35'
  const rightRangeClass = theme === 'light' ? 'bg-amber-200/90' : 'bg-amber-500/35'

  return (
    <div className={className}>
      <div className={`rounded-[1.05rem] border px-3.5 py-2.5 ${shellClass}`}>
        <div className={`flex ${compact ? 'items-center gap-3' : 'flex-col gap-2 sm:flex-row sm:items-center sm:gap-3'}`}>
          <span className={labelClass}>Distance</span>
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <span className={endpointClass}>Far</span>
            <div className={`relative h-2 flex-1 overflow-hidden rounded-full ${trackClass}`}>
              <div className="absolute inset-0 flex">
                <div className={`h-full w-[28%] ${leftRangeClass}`} />
                <div className={`h-full w-[44%] ${middleRangeClass}`} />
                <div className={`h-full w-[28%] ${rightRangeClass}`} />
              </div>
              <div
                className={`absolute top-0 h-full w-1.5 rounded-full transition-all duration-200 ${tone.marker}`}
                style={{ left: `${resolvedGuidance.meterPosition}%`, transform: 'translateX(-50%)' }}
              />
            </div>
            <span className={endpointClass}>Close</span>
          </div>
          <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${tone.badge}`}>
            {resolvedGuidance.label}
          </span>
        </div>
        {!compact && (
          <div className={`mt-2 ${detailClass}`}>
            {resolvedGuidance.detail}
          </div>
        )}
      </div>
    </div>
  )
}
