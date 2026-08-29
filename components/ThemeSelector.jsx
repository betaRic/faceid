'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { useTheme } from './ThemeProvider'
import { Icon, IconButton, cx } from './ui'

const THEME_OPTIONS = [
  { value: 'light', label: 'Light', icon: 'sun' },
  { value: 'dark', label: 'Dark', icon: 'moon' },
  { value: 'system', label: 'System', icon: 'monitor' },
]

export default function ThemeSelector() {
  const { preference, setPreference } = useTheme()
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const containerRef = useRef(null)
  const optionRefs = useRef([])
  const triggerRef = useRef(null)
  const menuId = useId()
  const selected = THEME_OPTIONS.find(option => option.value === preference) || THEME_OPTIONS[2]

  useEffect(() => {
    setOpen(false)
  }, [pathname])

  useEffect(() => {
    if (!open) return undefined

    const selectedIndex = THEME_OPTIONS.findIndex(option => option.value === preference)
    optionRefs.current[selectedIndex < 0 ? 2 : selectedIndex]?.focus()

    function handlePointerDown(event) {
      if (!containerRef.current?.contains(event.target)) setOpen(false)
    }

    function handleKeyDown(event) {
      if (event.key !== 'Escape') return
      setOpen(false)
      triggerRef.current?.focus()
    }

    document.addEventListener('pointerdown', handlePointerDown, true)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open, preference])

  function handleMenuKeyDown(event) {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()

    const currentIndex = optionRefs.current.findIndex(option => option === document.activeElement)
    let nextIndex
    if (event.key === 'Home') nextIndex = 0
    else if (event.key === 'End') nextIndex = THEME_OPTIONS.length - 1
    else if (event.key === 'ArrowDown') nextIndex = (currentIndex + 1 + THEME_OPTIONS.length) % THEME_OPTIONS.length
    else nextIndex = (currentIndex - 1 + THEME_OPTIONS.length) % THEME_OPTIONS.length

    optionRefs.current[nextIndex]?.focus()
  }

  function chooseTheme(nextPreference) {
    setPreference(nextPreference)
    setOpen(false)
    triggerRef.current?.focus()
  }

  return (
    <div className="relative" ref={containerRef}>
      <IconButton
        aria-controls={menuId}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={`Theme: ${selected.label}`}
        onClick={() => setOpen(value => !value)}
        ref={triggerRef}
        title={`Appearance: ${selected.label}`}
        variant="secondary"
      >
        <Icon name={selected.icon} />
      </IconButton>

      {open ? (
        <div
          aria-label="Appearance"
          className="absolute right-0 top-full z-[70] mt-2 w-44 rounded-surface border border-line bg-surface p-1.5 shadow-menu"
          id={menuId}
          onKeyDown={handleMenuKeyDown}
          role="menu"
        >
          {THEME_OPTIONS.map(option => {
            const active = option.value === preference
            return (
              <button
                aria-checked={active}
                className={cx(
                  'flex min-h-11 w-full items-center gap-3 rounded-control px-3 py-2 text-left text-sm font-medium transition-colors',
                  active ? 'bg-primary/10 text-primary' : 'text-foreground hover:bg-canvas',
                )}
                key={option.value}
                onClick={() => chooseTheme(option.value)}
                ref={(element) => {
                  optionRefs.current[THEME_OPTIONS.findIndex(item => item.value === option.value)] = element
                }}
                role="menuitemradio"
                tabIndex={active ? 0 : -1}
                type="button"
              >
                <Icon name={option.icon} />
                <span className="flex-1">{option.label}</span>
                {active ? <Icon name="check" size={16} /> : null}
              </button>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}
