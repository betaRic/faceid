import FaceSizeGuidance from '@/components/biometrics/FaceSizeGuidance'
import { Icon, Status } from '@/components/ui'

function PhaseGlyph({ phaseType, poseOk }) {
  const accentClass = poseOk ? 'text-emerald-300' : 'text-white/78'

  if (phaseType === 'chin_down') {
    return (
      <div className={`flex h-11 w-11 items-center justify-center rounded-control border border-white/20 bg-black/60 ${accentClass}`}>
        <Icon name="arrow-down" />
      </div>
    )
  }

  if (phaseType === 'center') {
    return (
      <div className="flex h-11 w-11 items-center justify-center rounded-control border border-white/20 bg-black/60">
        <Icon className={poseOk ? 'text-emerald-300' : 'text-white/80'} name="scan" />
      </div>
    )
  }

  return (
    <div className={`flex h-11 w-11 items-center justify-center rounded-control border border-white/20 bg-black/60 ${accentClass}`}>
      <Icon name="arrow-left-right" />
    </div>
  )
}

export default function GuidedCapturePanel({
  phase,
  phaseIndex = -1,
  phaseCount = 0,
  statusMsg = '',
  faceSizeGuidance,
  poseOk = false,
  className = '',
}) {
  const title = phase?.label || faceSizeGuidance?.label || 'Position your face'
  const subtitle = faceSizeGuidance?.isCaptureReady
    ? statusMsg || 'Hold still for capture.'
    : faceSizeGuidance?.detail || statusMsg || 'Center your face in the oval.'

  return (
    <div className={className}>
      <div className="rounded-surface border border-white/20 bg-black/80 px-4 py-3">
        <div className="flex items-start gap-3">
          <PhaseGlyph phaseType={phase?.poseType} poseOk={poseOk} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-3">
              <div className="text-xs font-medium text-white/70">
                Guided capture
              </div>
              {phase ? (
                <Status tone={poseOk ? 'active' : 'neutral'}>{phaseIndex + 1}/{phaseCount}</Status>
              ) : null}
            </div>
            <div className="mt-1 text-sm font-semibold text-white sm:text-base">{title}</div>
            <p className={`mt-1 text-xs leading-5 ${poseOk && faceSizeGuidance?.isCaptureReady ? 'text-emerald-300' : 'text-white/68'}`}>
              {subtitle}
            </p>
          </div>
        </div>

        <div className="mt-3">
          <FaceSizeGuidance className="w-full" compact guidance={faceSizeGuidance} theme="dark" />
        </div>

        {phaseCount > 0 ? (
          <div className="mt-3 flex items-center gap-1.5">
            {Array.from({ length: phaseCount }).map((_, index) => (
              <div key={index} className="flex items-center">
                <div
                  className={`h-2 w-2 rounded-full transition-all ${
                    index < phaseIndex
                      ? 'bg-emerald-400'
                      : index === phaseIndex
                        ? poseOk
                          ? 'bg-emerald-400'
                          : 'bg-amber-400'
                        : 'bg-white/20'
                  }`}
                />
                {index < phaseCount - 1 ? (
                  <div className={`h-px w-2 ${index < phaseIndex ? 'bg-emerald-400' : 'bg-white/16'}`} />
                ) : null}
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  )
}
