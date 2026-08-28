import { getFaceSizeGuidance } from '@/lib/biometrics/face-size-guidance'
import { Status } from '@/components/ui'

function resolveToneClasses(status, theme) {
  if (theme === 'light') {
    if (status === 'ready') {
      return {
        marker: 'bg-emerald-500',
      }
    }
    if (status === 'not-detected') {
      return {
        marker: 'bg-stone-400',
      }
    }
    return {
      marker: 'bg-amber-500',
    }
  }

  if (status === 'ready') {
    return {
      marker: 'bg-emerald-400',
    }
  }
  if (status === 'not-detected') {
    return {
      marker: 'bg-white/70',
    }
  }
  return {
    marker: 'bg-amber-400',
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
    ? 'border-line bg-surface text-foreground'
    : 'border-white/20 bg-black/80 text-white'

  const labelClass = theme === 'light'
    ? 'text-xs font-medium text-secondary'
    : 'text-xs font-medium text-white/70'

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
      <div className={`rounded-control border ${compact ? 'px-3 py-2.5' : 'px-3.5 py-3'} ${shellClass}`}>
        <div className="flex items-center justify-between gap-3">
          <span className={labelClass}>Distance</span>
          <Status tone={resolvedGuidance.status === 'ready' ? 'active' : resolvedGuidance.status === 'not-detected' ? 'neutral' : 'warning'}>{resolvedGuidance.label}</Status>
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
