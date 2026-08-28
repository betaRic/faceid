'use client'

import { Status } from '@/components/ui'
import {
  CAPTURE_DISTANCE_METER_READY_END,
  CAPTURE_DISTANCE_METER_READY_START,
  getFaceSizeGuidance,
} from '@/lib/biometrics/face-size-guidance'

function resolveTone(status) {
  if (status === 'ready') {
    return {
      status: 'active',
      marker: 'bg-emerald-300',
    }
  }

  if (status === 'not-detected') {
    return {
      status: 'neutral',
      marker: 'bg-white/80',
    }
  }

  return {
    status: 'warning',
    marker: 'bg-amber-300',
  }
}

export default function CaptureDistanceHud({ guidance, faceAreaRatio, className = '' }) {
  const resolvedGuidance = guidance || getFaceSizeGuidance(faceAreaRatio)
  const tone = resolveTone(resolvedGuidance.status)
  const readyWidth = CAPTURE_DISTANCE_METER_READY_END - CAPTURE_DISTANCE_METER_READY_START
  const nearWidth = 100 - CAPTURE_DISTANCE_METER_READY_END

  return (
    <div className={className}>
      <div className="rounded-control border border-white/20 bg-black/80 px-3 py-2 text-white">
        <div className="flex items-center gap-2.5">
          <span className="shrink-0 text-xs font-medium text-white/70">
            Distance
          </span>

          <div className="flex min-w-0 flex-1 items-center gap-2">
            <span className="text-[10px] font-medium text-white/38">Far</span>
            <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-white/14">
              <div className="absolute inset-0 flex">
                <div className="h-full bg-amber-500/28" style={{ width: `${CAPTURE_DISTANCE_METER_READY_START}%` }} />
                <div className="h-full bg-emerald-500/28" style={{ width: `${readyWidth}%` }} />
                <div className="h-full bg-amber-500/28" style={{ width: `${nearWidth}%` }} />
              </div>
              <div
                className={`absolute top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full transition-all duration-200 ${tone.marker}`}
                style={{ left: `${resolvedGuidance.meterPosition}%`, transform: 'translate(-50%, -50%)' }}
              />
            </div>
            <span className="text-[10px] font-medium text-white/38">Near</span>
          </div>

          <Status tone={tone.status}>{resolvedGuidance.label}</Status>
        </div>
      </div>
    </div>
  )
}
