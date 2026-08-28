'use client'

import { useEffect, useState } from 'react'
import { Button, Dialog } from './ui'

function isIosDevice() {
  if (typeof navigator === 'undefined') return false
  return /iPad|iPhone|iPod/.test(navigator.userAgent)
}

function isStandalone() {
  return window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true
}

export default function AddToHomeScreenButton({ className = '' }) {
  const [installEvent, setInstallEvent] = useState(null)
  const [showIosHelp, setShowIosHelp] = useState(false)
  const [available, setAvailable] = useState(false)

  useEffect(() => {
    if (isStandalone()) return
    setAvailable(isIosDevice())
    const onBeforeInstall = event => {
      event.preventDefault()
      setInstallEvent(event)
      setAvailable(true)
    }
    window.addEventListener('beforeinstallprompt', onBeforeInstall)
    navigator.serviceWorker?.register('/sw.js').catch(() => {})
    return () => window.removeEventListener('beforeinstallprompt', onBeforeInstall)
  }, [])

  async function handleInstall() {
    if (installEvent) {
      await installEvent.prompt()
      await installEvent.userChoice
      setInstallEvent(null)
      setAvailable(false)
      return
    }
    if (isIosDevice()) setShowIosHelp(true)
  }

  if (!available) return null

  return (
    <>
      <Button className={className} onClick={handleInstall} variant="secondary">
        Add to Home Screen
      </Button>
      <Dialog
        footer={<Button onClick={() => setShowIosHelp(false)}>Done</Button>}
        onClose={() => setShowIosHelp(false)}
        open={showIosHelp}
        title="Add VeriFace to your iPhone"
      >
        <ol className="list-decimal space-y-2 pl-5 text-sm leading-6 text-secondary">
          <li>Tap the <strong>Share</strong> button in Safari.</li>
          <li>Choose <strong>Add to Home Screen</strong>.</li>
          <li>Tap <strong>Add</strong>.</li>
        </ol>
      </Dialog>
    </>
  )
}
