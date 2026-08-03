'use client'

import { useEffect, useState } from 'react'

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
      <button className={`btn btn-ghost px-6 py-3 ${className}`.trim()} onClick={handleInstall} type="button">
        Add to Home Screen
      </button>
      {showIosHelp ? (
        <div className="fixed inset-0 z-[100] flex items-end bg-black/45 p-4 sm:items-center sm:justify-center" role="dialog" aria-modal="true">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
            <h2 className="text-lg font-bold text-navy">Add VeriFace to your iPhone</h2>
            <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-slate">
              <li>Tap the <strong>Share</strong> button in Safari.</li>
              <li>Choose <strong>Add to Home Screen</strong>.</li>
              <li>Tap <strong>Add</strong>.</li>
            </ol>
            <button className="btn btn-primary mt-5 w-full" onClick={() => setShowIosHelp(false)} type="button">Done</button>
          </div>
        </div>
      ) : null}
    </>
  )
}
