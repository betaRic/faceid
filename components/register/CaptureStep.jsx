'use client'

import { motion } from 'framer-motion'
import FaceSizeGuidance from '@/components/biometrics/FaceSizeGuidance'
import { OVAL_CAPTURE_ASPECT_RATIO } from '@/lib/biometrics/oval-capture'
import { CAPTURE_PHASES } from '@/hooks/useEnrollmentCapture'

const OVAL_FRAME_STYLE = { borderRadius: '44% / 34%' }

function PoseArcIndicator({ yaw, poseOk, phaseType }) {
  if (phaseType === null || phaseType === undefined) return null

  const isCenterPhase = phaseType === 'center'
  let leftFill = 0
  let rightFill = 0

  if (yaw !== null) {
    if (isCenterPhase) {
      const deviation = Math.min(1, Math.abs(yaw) / 0.25) * 0.5
      leftFill = deviation
      rightFill = deviation
    } else if (yaw > 0) {
      leftFill = Math.min(1, (yaw - 0.08) / 0.2)
    } else {
      rightFill = Math.min(1, (-yaw - 0.08) / 0.2)
    }
  }

  const color = poseOk
    ? 'bg-emerald-400'
    : yaw !== null && Math.abs(yaw) > 0.06
      ? 'bg-amber-400'
      : 'bg-white/30'

  return (
    <div className="flex items-center gap-1">
      <div className="h-1 w-8 overflow-hidden rounded-full bg-white/15">
        <div
          className={`h-full rounded-full transition-all duration-150 ${color}`}
          style={{ width: `${leftFill * 100}%`, marginLeft: 'auto' }}
        />
      </div>
      <div className={`h-2 w-2 rounded-full border transition-all duration-150 ${
        poseOk ? 'border-emerald-400 bg-emerald-400' : 'border-white/50 bg-transparent'
      }`} />
      <div className="h-1 w-8 overflow-hidden rounded-full bg-white/15">
        <div
          className={`h-full rounded-full transition-all duration-150 ${color}`}
          style={{ width: `${rightFill * 100}%` }}
        />
      </div>
    </div>
  )
}

function PhaseIndicator({ capturePhase, poseOk, currentYaw, statusMsg, faceSizeGuidance }) {
  const phase = capturePhase >= 0 ? CAPTURE_PHASES[capturePhase] : null

  return (
    <div className="w-full max-w-md sm:max-w-lg">
      <div className="rounded-[1.1rem] border border-white/16 bg-black/78 p-3 backdrop-blur">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/58">Camera guidance</div>
            <div className="mt-1 text-sm font-semibold text-white sm:text-base">
              {phase ? phase.label : 'Position your face in the oval'}
            </div>
            <p className="mt-1 text-xs leading-5 text-white/65">
              {faceSizeGuidance?.label || 'Position face'} · {faceSizeGuidance?.detail || 'Keep your face inside the oval.'}
            </p>
          </div>
          {phase ? (
            <span className="shrink-0 rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/72">
              {capturePhase + 1}/{CAPTURE_PHASES.length}
            </span>
          ) : null}
        </div>

        {phase ? (
          <div className="mt-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-1.5">
              {CAPTURE_PHASES.map((pose, index) => (
                <div key={pose.id} className="flex items-center">
                  <div
                    className={`h-2 w-2 rounded-full transition-all ${
                      index < capturePhase
                        ? 'bg-emerald-400'
                        : index === capturePhase
                          ? poseOk
                            ? 'bg-emerald-400'
                            : 'bg-amber-400'
                          : 'bg-white/24'
                    }`}
                  />
                  {index < CAPTURE_PHASES.length - 1 ? (
                    <div className={`h-px w-2 ${index < capturePhase ? 'bg-emerald-400' : 'bg-white/24'}`} />
                  ) : null}
                </div>
              ))}
            </div>
            <PoseArcIndicator
              yaw={currentYaw}
              poseOk={poseOk}
              phaseType={phase.poseType}
            />
          </div>
        ) : null}

        <div className="mt-3">
          <FaceSizeGuidance className="w-full" compact guidance={faceSizeGuidance} theme="dark" />
        </div>

        <p className={`mt-3 text-sm leading-6 ${poseOk ? 'text-emerald-300' : 'text-white/90'}`}>
          {statusMsg}
        </p>
      </div>
    </div>
  )
}

export default function CaptureStep({
  camera,
  capturePhase,
  currentYaw,
  employeeId,
  errorMessage,
  faceFound,
  faceSizeGuidance,
  name,
  onBack,
  onExit,
  poseOk,
  selectedOffice,
  statusMsg,
}) {
  return (
    <div className="page-frame h-full min-h-0">
      <motion.section
        animate={{ opacity: 1, y: 0 }}
        initial={{ opacity: 0, y: 18 }}
        transition={{ duration: 0.35 }}
        className="relative flex min-h-0 w-full flex-1 flex-col overflow-hidden rounded-[1.4rem] border border-black/5 bg-black shadow-glow"
      >
        <div className="absolute inset-0 z-[1] bg-[radial-gradient(circle_at_top,rgba(17,133,108,0.18),transparent_40%),linear-gradient(180deg,rgba(3,10,9,0.92),rgba(8,13,12,0.96))]" />

        <div className="relative z-[2] flex min-h-0 flex-1 items-center justify-center px-4 pt-6 sm:pb-36">
          <div className="absolute left-3 top-3 z-[4] flex items-center gap-2">
            <button
              className="rounded-full border border-white/20 bg-black/35 px-4 py-2 text-sm font-semibold text-white backdrop-blur hover:bg-black/50"
              onClick={onBack}
              type="button"
            >
              ← Details
            </button>
            {onExit ? (
              <button
                className="rounded-full border border-white/12 bg-white/8 px-4 py-2 text-sm font-semibold text-white/88 backdrop-blur hover:bg-white/12"
                onClick={onExit}
                type="button"
              >
                Exit
              </button>
            ) : null}
          </div>

          <div className="absolute right-3 top-3 z-[4] hidden rounded-full bg-black/35 px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-white/78 backdrop-blur sm:block">
            {employeeId || 'Pending ID'} · {selectedOffice?.shortName || selectedOffice?.name || 'Office'}
          </div>

          <div
            className="relative w-[72vw] sm:w-[54vw]"
            style={{
              aspectRatio: String(OVAL_CAPTURE_ASPECT_RATIO),
              maxWidth: `min(430px, calc(min(72vh, 640px) * ${OVAL_CAPTURE_ASPECT_RATIO}))`,
            }}
          >
            <div
              className={`absolute inset-0 transition-all duration-200 ${
                capturePhase >= 0 && poseOk
                  ? 'ring-2 ring-emerald-400/80 shadow-[0_0_50px_rgba(16,185,129,0.32)]'
                  : capturePhase >= 0
                    ? 'ring-2 ring-blue-400/60 shadow-[0_0_40px_rgba(59,130,246,0.20)]'
                    : faceFound
                      ? faceSizeGuidance?.isCaptureReady
                        ? 'ring-2 ring-emerald-400/70'
                        : 'ring-2 ring-amber-400/70 shadow-[0_0_30px_rgba(251,191,36,0.24)]'
                      : 'ring-1 ring-white/18'
              }`}
              style={OVAL_FRAME_STYLE}
            />
            <div className="absolute inset-[2px] overflow-hidden bg-black" style={OVAL_FRAME_STYLE}>
              <video ref={camera.setVideoRef} playsInline muted autoPlay className="absolute inset-0 h-full w-full object-cover" style={{ transform: 'scaleX(-1)' }} />
              <canvas ref={camera.canvasRef} style={{ display: 'none' }} />
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_18%,transparent,rgba(0,0,0,0.1)_54%,rgba(0,0,0,0.36)_100%)]" />
            </div>
          </div>
        </div>

        {!camera.camOn ? (
          <div className="absolute inset-0 z-[5] flex flex-col items-center justify-center gap-3 bg-black/60 text-center text-white">
            <div className="text-5xl opacity-60">◈</div>
            <div className="text-sm">{camera.camError || 'Camera offline'}</div>
          </div>
        ) : null}

        <div className="relative z-[5] border-t border-white/10 bg-black/88 px-3 pb-3 pt-3 sm:hidden">
          <PhaseIndicator
            capturePhase={capturePhase}
            currentYaw={currentYaw}
            faceSizeGuidance={faceSizeGuidance}
            poseOk={poseOk}
            statusMsg={statusMsg}
          />
        </div>

        <div className="absolute inset-x-0 bottom-0 z-[5] hidden justify-center px-3 pb-3 sm:flex sm:px-4 sm:pb-4">
          <PhaseIndicator
            capturePhase={capturePhase}
            currentYaw={currentYaw}
            faceSizeGuidance={faceSizeGuidance}
            poseOk={poseOk}
            statusMsg={statusMsg}
          />
        </div>

        {errorMessage ? (
          <div className="absolute inset-x-3 bottom-20 z-[5] rounded-2xl bg-red-50/95 px-4 py-3 text-sm text-warn shadow-lg">
            {errorMessage}
          </div>
        ) : null}
      </motion.section>
    </div>
  )
}
