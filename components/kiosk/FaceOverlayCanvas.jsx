import { useEffect, useRef } from 'react'
import { drawBracketBox } from '@/lib/kiosk-utils'

export default function FaceOverlayCanvas({ detection, sourceWidth, sourceHeight, videoRef }) {
  const overlayRef = useRef(null)

  useEffect(() => {
    if (!overlayRef.current || !videoRef?.current || !detection) return

    const video = videoRef.current
    const overlay = overlayRef.current
    const box = detection?.detection?.box || detection?.box

    if (!box) return

    const width = video.videoWidth || 640
    const height = video.videoHeight || 480
    const scaleX = sourceWidth ? width / sourceWidth : 1
    const scaleY = sourceHeight ? height / sourceHeight : 1
    overlay.width = width
    overlay.height = height

    const ctx = overlay.getContext('2d')
    ctx.clearRect(0, 0, width, height)
    drawBracketBox(ctx, box, '#22c55e', 'FACE READY', null, scaleX, scaleY)
  }, [detection, sourceWidth, sourceHeight, videoRef])

  return <canvas ref={overlayRef} className="absolute inset-0 z-[2] h-full w-full" />
}