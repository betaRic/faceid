'use client'

import { AnimatePresence, motion } from 'framer-motion'

function resolveToneClasses(tone) {
  switch (tone) {
    case 'ready':
      return {
        shell: 'border-emerald-400/26 bg-emerald-500/14',
        dot: 'bg-emerald-300',
        title: 'text-emerald-50',
        counter: 'border-emerald-300/20 bg-emerald-300/12 text-emerald-50/92',
        active: 'bg-emerald-300',
        complete: 'bg-emerald-300/55',
      }
    case 'active':
      return {
        shell: 'border-sky-400/24 bg-sky-500/12',
        dot: 'bg-sky-300',
        title: 'text-sky-50',
        counter: 'border-sky-300/20 bg-sky-300/12 text-sky-50/92',
        active: 'bg-sky-300',
        complete: 'bg-sky-300/55',
      }
    case 'warn':
      return {
        shell: 'border-amber-400/26 bg-amber-500/14',
        dot: 'bg-amber-300',
        title: 'text-amber-50',
        counter: 'border-amber-300/20 bg-amber-300/12 text-amber-50/92',
        active: 'bg-amber-300',
        complete: 'bg-amber-300/55',
      }
    case 'danger':
      return {
        shell: 'border-red-400/26 bg-red-500/14',
        dot: 'bg-red-300',
        title: 'text-red-50',
        counter: 'border-red-300/20 bg-red-300/12 text-red-50/92',
        active: 'bg-red-300',
        complete: 'bg-red-300/55',
      }
    default:
      return {
        shell: 'border-white/12 bg-black/48',
        dot: 'bg-white/72',
        title: 'text-white',
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

  return (
    <motion.div
      animate={{ opacity: 1, y: 0 }}
      className={`flex flex-col items-center ${className}`}
      initial={{ opacity: 0, y: -12 }}
      transition={{ duration: 0.22, ease: 'easeOut' }}
    >
      <div className={`inline-flex max-w-full items-center gap-2 rounded-full border px-3 py-2 text-center shadow-[0_14px_34px_rgba(0,0,0,0.24)] backdrop-blur-xl sm:px-3.5 ${palette.shell}`}>
        <span className={`h-2 w-2 shrink-0 rounded-full ${palette.dot}`} />

        <AnimatePresence mode="wait">
          <motion.span
            key={title}
            animate={{ opacity: 1, y: 0 }}
            className={`max-w-[12rem] truncate text-sm font-semibold sm:max-w-[15rem] sm:text-[15px] ${palette.title}`}
            initial={{ opacity: 0, y: 6 }}
            transition={{ duration: 0.18 }}
          >
            {title}
          </motion.span>
        </AnimatePresence>

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
    </motion.div>
  )
}
