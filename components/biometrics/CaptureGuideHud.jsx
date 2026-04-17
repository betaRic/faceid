'use client'

import { AnimatePresence, motion } from 'framer-motion'

function resolveToneClasses(tone) {
  switch (tone) {
    case 'ready':
      return {
        shell: 'border-emerald-400/22 bg-emerald-500/12',
        eyebrow: 'text-emerald-200/88',
        dot: 'bg-emerald-300',
        title: 'text-white',
        subtitle: 'text-emerald-100/90',
      }
    case 'active':
      return {
        shell: 'border-sky-400/22 bg-sky-500/10',
        eyebrow: 'text-sky-100/86',
        dot: 'bg-sky-300',
        title: 'text-white',
        subtitle: 'text-sky-100/88',
      }
    case 'warn':
      return {
        shell: 'border-amber-400/24 bg-amber-500/12',
        eyebrow: 'text-amber-100/88',
        dot: 'bg-amber-300',
        title: 'text-white',
        subtitle: 'text-amber-100/88',
      }
    case 'danger':
      return {
        shell: 'border-red-400/26 bg-red-500/12',
        eyebrow: 'text-red-100/90',
        dot: 'bg-red-300',
        title: 'text-white',
        subtitle: 'text-red-100/90',
      }
    default:
      return {
        shell: 'border-white/12 bg-black/48',
        eyebrow: 'text-white/62',
        dot: 'bg-white/70',
        title: 'text-white',
        subtitle: 'text-white/72',
      }
  }
}

export default function CaptureGuideHud({
  title,
  subtitle = '',
  eyebrow = 'Live guidance',
  tone = 'neutral',
  steps = [],
  className = '',
}) {
  const palette = resolveToneClasses(tone)

  return (
    <motion.div
      animate={{ opacity: 1, y: 0 }}
      className={className}
      initial={{ opacity: 0, y: -16 }}
      transition={{ duration: 0.28, ease: 'easeOut' }}
    >
      <div className={`w-full rounded-[1.3rem] border px-3.5 py-3 text-center shadow-[0_18px_40px_rgba(0,0,0,0.28)] backdrop-blur-xl sm:px-4 ${palette.shell}`}>
        <div className={`flex items-center justify-center gap-2 text-[10px] font-semibold uppercase tracking-[0.22em] ${palette.eyebrow}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${palette.dot}`} />
          {eyebrow}
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={`${title}-${subtitle}`}
            animate={{ opacity: 1, y: 0 }}
            initial={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.2 }}
          >
            <div className={`mt-2 text-base font-semibold sm:text-lg ${palette.title}`}>
              {title}
            </div>
            {subtitle ? (
              <p className={`mt-1 text-xs leading-5 sm:text-[13px] ${palette.subtitle}`}>
                {subtitle}
              </p>
            ) : null}
          </motion.div>
        </AnimatePresence>

        {steps.length > 0 ? (
          <div className="mt-3 flex flex-wrap items-center justify-center gap-1.5">
            {steps.map((step) => (
              <div
                key={step.id}
                className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] transition-all ${
                  step.complete
                    ? 'border-emerald-400/28 bg-emerald-500/18 text-emerald-100'
                    : step.active
                      ? tone === 'warn'
                        ? 'border-amber-400/28 bg-amber-500/18 text-amber-100'
                        : 'border-sky-400/28 bg-sky-500/18 text-sky-100'
                      : 'border-white/10 bg-white/6 text-white/54'
                }`}
              >
                {step.label}
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </motion.div>
  )
}
