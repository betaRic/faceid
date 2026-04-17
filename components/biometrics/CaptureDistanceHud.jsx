'use client'

import { motion } from 'framer-motion'
import { getFaceSizeGuidance } from '@/lib/biometrics/face-size-guidance'

function resolveTone(status) {
  if (status === 'ready') {
    return {
      badge: 'bg-emerald-500/80 text-white',
      marker: 'bg-emerald-400 shadow-[0_0_18px_rgba(52,211,153,0.55)]',
    }
  }

  if (status === 'not-detected') {
    return {
      badge: 'bg-white/12 text-white/74',
      marker: 'bg-white/80',
    }
  }

  return {
    badge: 'bg-amber-500/85 text-white',
    marker: 'bg-amber-300 shadow-[0_0_18px_rgba(252,211,77,0.45)]',
  }
}

export default function CaptureDistanceHud({ guidance, faceAreaRatio, className = '' }) {
  const resolvedGuidance = guidance || getFaceSizeGuidance(faceAreaRatio)
  const tone = resolveTone(resolvedGuidance.status)

  return (
    <motion.div
      animate={{ opacity: 1, y: 0 }}
      className={className}
      initial={{ opacity: 0, y: 14 }}
      transition={{ duration: 0.22, ease: 'easeOut' }}
    >
      <div className="rounded-[1.15rem] border border-white/12 bg-black/52 px-3.5 py-2.5 text-white shadow-[0_16px_38px_rgba(0,0,0,0.28)] backdrop-blur-xl">
        <div className="flex items-center justify-between gap-3">
          <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/48">Distance</span>
          <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] ${tone.badge}`}>
            {resolvedGuidance.label}
          </span>
        </div>

        <div className="mt-2 flex items-center gap-2.5">
          <span className="text-[10px] font-medium text-white/44">Far</span>
          <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-white/16">
            <div className="absolute inset-0 flex">
              <div className="h-full w-[24%] bg-amber-500/35" />
              <div className="h-full w-[52%] bg-emerald-500/35" />
              <div className="h-full w-[24%] bg-amber-500/35" />
            </div>
            <div
              className={`absolute top-0 h-full w-1.5 rounded-full transition-all duration-200 ${tone.marker}`}
              style={{ left: `${resolvedGuidance.meterPosition}%`, transform: 'translateX(-50%)' }}
            />
          </div>
          <span className="text-[10px] font-medium text-white/44">Near</span>
        </div>
      </div>
    </motion.div>
  )
}
