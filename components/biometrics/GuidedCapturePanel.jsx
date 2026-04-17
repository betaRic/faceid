import FaceSizeGuidance from '@/components/biometrics/FaceSizeGuidance'

function PhaseGlyph({ phaseType, poseOk }) {
  const accentClass = poseOk ? 'text-emerald-300' : 'text-white/78'

  if (phaseType === 'chin_down') {
    return (
      <div className={`flex h-10 w-10 items-center justify-center rounded-2xl border border-white/12 bg-white/6 text-lg ${accentClass}`}>
        ↓
      </div>
    )
  }

  if (phaseType === 'center') {
    return (
      <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/12 bg-white/6">
        <div className={`h-4 w-4 rounded-full border ${poseOk ? 'border-emerald-300 bg-emerald-300/80' : 'border-white/60 bg-white/20'}`} />
      </div>
    )
  }

  return (
    <div className={`flex h-10 w-10 items-center justify-center rounded-2xl border border-white/12 bg-white/6 text-lg ${accentClass}`}>
      ↔
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
      <div className="rounded-[1.2rem] border border-white/12 bg-black/52 px-4 py-3 shadow-[0_18px_42px_rgba(0,0,0,0.32)] backdrop-blur-xl">
        <div className="flex items-start gap-3">
          <PhaseGlyph phaseType={phase?.poseType} poseOk={poseOk} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-3">
              <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/48">
                Guided capture
              </div>
              {phase ? (
                <span className="shrink-0 rounded-full border border-white/10 bg-white/6 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/66">
                  {phaseIndex + 1}/{phaseCount}
                </span>
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
