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
    : 'border-white/12 bg-black/48 text-white shadow-[0_12px_30px_rgba(0,0,0,0.26)] backdrop-blur-xl'

  const labelClass = theme === 'light'
    ? 'text-[10px] uppercase tracking-[0.16em] text-muted'
    : 'text-[10px] uppercase tracking-[0.16em] text-white/44'

  const endpointClass = theme === 'light'
    ? 'text-[10px] font-medium text-muted'
    : 'text-[10px] font-medium text-white/42'

  const detailClass = theme === 'light'
    ? 'text-xs text-muted'
    : 'text-xs text-white/72'

  const trackClass = theme === 'light' ? 'bg-stone-100' : 'bg-white/20'
  const leftRangeClass = theme === 'light' ? 'bg-amber-200/90' : 'bg-amber-500/35'
  const middleRangeClass = theme === 'light' ? 'bg-emerald-200/95' : 'bg-emerald-500/35'
  const rightRangeClass = theme === 'light' ? 'bg-amber-200/90' : 'bg-amber-500/35'

  return (
    <div className={className}>
      <div className={`rounded-[1.05rem] border ${compact ? 'px-3 py-2.5' : 'px-3.5 py-3'} ${shellClass}`}>
        <div className="flex items-center justify-between gap-3">
          <span className={labelClass}>Distance</span>
          <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${tone.badge}`}>
            {resolvedGuidance.label}
          </span>
        </div>

        <div className="mt-2 flex min-w-0 items-center gap-2">
          <span className={endpointClass}>Far</span>
          <div className={`relative h-2 flex-1 overflow-hidden rounded-full ${trackClass}`}>
            <div className="absolute inset-0 flex">
              <div className={`h-full w-[24%] ${leftRangeClass}`} />
              <div className={`h-full w-[52%] ${middleRangeClass}`} />
              <div className={`h-full w-[24%] ${rightRangeClass}`} />
            </div>
            <div
              className={`absolute top-0 h-full w-1.5 rounded-full transition-all duration-200 ${tone.marker}`}
              style={{ left: `${resolvedGuidance.meterPosition}%`, transform: 'translateX(-50%)' }}
            />
          </div>
          <span className={endpointClass}>Near</span>
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
