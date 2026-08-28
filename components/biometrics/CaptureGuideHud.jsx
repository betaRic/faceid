'use client'

import { Status } from '@/components/ui'

function resolveToneClasses(tone) {
  switch (tone) {
    case 'ready':
      return {
        counter: 'border-emerald-300/20 bg-emerald-300/12 text-emerald-50/92',
        active: 'bg-emerald-300',
        complete: 'bg-emerald-300/55',
      }
    case 'active':
      return {
        counter: 'border-sky-300/20 bg-sky-300/12 text-sky-50/92',
        active: 'bg-sky-300',
        complete: 'bg-sky-300/55',
      }
    case 'warn':
      return {
        counter: 'border-amber-300/20 bg-amber-300/12 text-amber-50/92',
        active: 'bg-amber-300',
        complete: 'bg-amber-300/55',
      }
    case 'danger':
      return {
        counter: 'border-red-300/20 bg-red-300/12 text-red-50/92',
        active: 'bg-red-300',
        complete: 'bg-red-300/55',
      }
    default:
      return {
        counter: 'border-white/12 bg-white/8 text-white/76',
        active: 'bg-white/90',
        complete: 'bg-white/46',
      }
  }
}

export default function CaptureGuideHud({
  title,
  tone = 'neutral',
  steps = [],
  className = '',
  counterLabel = '',
}) {
  const palette = resolveToneClasses(tone)
  const activeStepIndex = steps.findIndex((step) => step.active)
  const progressLabel = counterLabel || (steps.length > 0 && activeStepIndex >= 0
    ? `${activeStepIndex + 1}/${steps.length}`
    : '')
  const statusTone = tone === 'ready' ? 'active' : tone === 'warn' ? 'warning' : tone === 'danger' ? 'danger' : 'neutral'

  return (
    <div className={`flex flex-col items-center ${className}`}>
      <div className="inline-flex max-w-full items-center gap-2 rounded-control border border-white/20 bg-black/80 px-3 py-2 text-center sm:px-3.5">
        <Status className="max-w-[15rem] truncate" tone={statusTone}>{title}</Status>

        {progressLabel ? (
          <span className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${palette.counter}`}>
            {progressLabel}
          </span>
        ) : null}
      </div>

      {steps.length > 0 ? (
        <div className="mt-2 flex items-center justify-center gap-1.5 px-2">
          {steps.map((step) => (
            <span
              key={step.id}
              className={`h-1.5 rounded-full transition-all duration-200 ${
                step.active
                  ? `w-5 ${palette.active}`
                  : step.complete
                    ? `w-3 ${palette.complete}`
                    : 'w-2 bg-white/18'
              }`}
            />
          ))}
        </div>
      ) : null}
    </div>
  )
}
