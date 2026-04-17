'use client'

import { motion } from 'framer-motion'
import { getFaceSizeGuidance } from '@/lib/biometrics/face-size-guidance'

function resolveTone(status) {
  if (status === 'ready') {
    return {
      badge: 'border-emerald-400/24 bg-emerald-400/14 text-emerald-50',
      marker: 'bg-emerald-300 shadow-[0_0_14px_rgba(52,211,153,0.48)]',
    }
  }

  if (status === 'not-detected') {
    return {
      badge: 'border-white/12 bg-white/8 text-white/74',
      marker: 'bg-white/80',
    }
  }

  return {
    badge: 'border-amber-400/24 bg-amber-400/14 text-amber-50',
    marker: 'bg-amber-300 shadow-[0_0_14px_rgba(252,211,77,0.38)]',
  }
}

export default function CaptureDistanceHud({ guidance, faceAreaRatio, className = '' }) {
  const resolvedGuidance = guidance || getFaceSizeGuidance(faceAreaRatio)
  const tone = resolveTone(resolvedGuidance.status)

  return (
    <motion.div
      animate={{ opacity: 1, y: 0 }}
      className={className}
      initial={{ opacity: 0, y: 12 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
    >
      <div className="rounded-full border border-white/12 bg-black/50 px-3 py-2 text-white shadow-[0_14px_30px_rgba(0,0,0,0.24)] backdrop-blur-xl">
        <div className="flex items-center gap-2.5">
          <span className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/44">
            Distance
          </span>

          <div className="flex min-w-0 flex-1 items-center gap-2">
            <span className="text-[10px] font-medium text-white/38">Far</span>
            <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-white/14">
              <div className="absolute inset-0 flex">
                <div className="h-full w-[24%] bg-amber-500/28" />
                <div className="h-full w-[52%] bg-emerald-500/28" />
                <div className="h-full w-[24%] bg-amber-500/28" />
              </div>
              <div
                className={`absolute top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full transition-all duration-200 ${tone.marker}`}
                style={{ left: `${resolvedGuidance.meterPosition}%`, transform: 'translate(-50%, -50%)' }}
              />
            </div>
            <span className="text-[10px] font-medium text-white/38">Near</span>
          </div>

          <span className={`shrink-0 rounded-full border px-2 py-1 text-[10px] font-semibold ${tone.badge}`}>
            {resolvedGuidance.label}
          </span>
        </div>
      </div>
    </motion.div>
  )
}
