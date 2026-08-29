'use client'

import { useEffect, useId, useState } from 'react'
import { Icon, IconButton, Surface, cx } from '@/components/ui'
import ThemeSelector from '@/components/ThemeSelector'

const SIDEBAR_PREFERENCE_KEY = 'faceattend:admin-sidebar-collapsed:v2'

const navigationIcons = {
  dashboard: 'dashboard',
  office: 'building',
  employees: 'employees',
  summary: 'report',
  workforce: 'attendance',
  settings: 'settings',
  roles: 'security',
  'office-settings': 'settings',
}

function NavButton({ item, active, onClick, compact = false, collapsed = false }) {
  return (
    <button
      aria-current={active ? 'page' : undefined}
      aria-label={collapsed ? item.label : undefined}
      className={cx(
        'group relative inline-flex min-h-11 items-center gap-3 rounded-control text-left text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-45',
        collapsed ? 'w-11 justify-center px-0' : compact ? 'px-3' : 'w-full px-3',
        active ? 'bg-primary/10 text-primary before:absolute before:inset-y-2 before:left-0 before:w-0.5 before:rounded-full before:bg-accent' : 'text-secondary hover:bg-canvas hover:text-primary',
      )}
      disabled={item.disabled}
      onClick={() => onClick?.(item.id)}
      title={collapsed ? item.label : undefined}
      type="button"
    >
      <Icon className="shrink-0" name={navigationIcons[item.id] || 'settings'} />
      {!collapsed ? <span className="truncate">{item.label}</span> : null}
      {item.badge && !collapsed ? (
        <span
          aria-label={`${item.badge > 99 ? '99 or more' : item.badge} pending approvals`}
          className="ml-auto inline-flex min-w-6 items-center justify-center rounded-full bg-accent px-1.5 py-0.5 text-[11px] font-bold text-accent-contrast"
        >
          {item.badge > 99 ? '99+' : item.badge}
        </span>
      ) : null}
      {item.badge && collapsed ? (
        <span aria-label={`${item.badge > 99 ? '99 or more' : item.badge} pending approvals`} className="absolute right-0 top-0 h-2.5 w-2.5 rounded-full border-2 border-surface bg-accent" />
      ) : null}
    </button>
  )
}

function Navigation({ items, activePanel, onPanelChange, compact = false, collapsed = false, onNavigate }) {
  return items.map((item) => (
    <NavButton
      active={activePanel === item.id}
      collapsed={collapsed}
      compact={compact}
      item={item}
      key={item.id}
      onClick={(id) => {
        onPanelChange?.(id)
        onNavigate?.()
      }}
    />
  ))
}

export default function AdminShell({
  children,
  navItems = [],
  activePanel = '',
  onPanelChange,
  roleScope = 'regional',
  actions = null,
}) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const drawerTitleId = useId()
  const workspaceLabel = roleScope === 'regional' ? 'Regional Admin workspace' : 'Office HR workspace'

  useEffect(() => {
    setSidebarCollapsed(window.localStorage.getItem(SIDEBAR_PREFERENCE_KEY) === 'true')
  }, [])

  useEffect(() => {
    if (!mobileOpen) return undefined
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    function handleKeyDown(event) {
      if (event.key === 'Escape') setMobileOpen(false)
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = previousOverflow
    }
  }, [mobileOpen])

  function toggleSidebar() {
    setSidebarCollapsed((current) => {
      const next = !current
      window.localStorage.setItem(SIDEBAR_PREFERENCE_KEY, String(next))
      return next
    })
  }

  return (
    <div className="flex min-h-[100dvh] flex-col overflow-x-hidden bg-canvas text-foreground md:h-[100dvh] md:overflow-hidden">
      <header className="sticky top-0 z-30 shrink-0 border-b border-line bg-surface/95 backdrop-blur">
        <div className="mx-auto flex min-h-16 w-full max-w-[1600px] items-center gap-3 px-3 py-2 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <img alt="" className="h-8 w-8 shrink-0 object-contain" src="/brand/dilg-logo.svg" />
            <div className="hidden min-w-0 sm:block">
              <div className="truncate text-sm font-semibold text-primary">VeriFace administration</div>
              <div className="truncate text-xs text-secondary">{workspaceLabel}</div>
            </div>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <ThemeSelector />
            {actions}
            {navItems.length > 0 ? (
              <IconButton
                aria-expanded={mobileOpen}
                aria-label="Open workspace navigation"
                className="md:hidden"
                onClick={() => setMobileOpen(true)}
                variant="secondary"
              >
                <Icon name="menu" />
              </IconButton>
            ) : null}
          </div>
        </div>

        {navItems.length > 0 ? (
          <nav aria-label="Workspace navigation" className="mx-auto hidden max-w-[1600px] flex-wrap gap-1 border-t border-line px-6 py-2 md:flex xl:hidden">
            <Navigation activePanel={activePanel} compact items={navItems} onPanelChange={onPanelChange} />
          </nav>
        ) : null}
      </header>

      <div className="mx-auto flex w-full max-w-[1600px] flex-1 flex-col px-3 py-3 sm:px-6 md:min-h-0 md:py-4">
        <div className={cx('grid flex-1 gap-4 md:min-h-0', sidebarCollapsed ? 'xl:grid-cols-[72px_minmax(0,1fr)]' : 'xl:grid-cols-[260px_minmax(0,1fr)]')}>
          {navItems.length > 0 ? (
            <aside className="hidden min-h-0 xl:block">
              <Surface className="flex h-full flex-col overflow-hidden">
                <div className={cx('flex items-center border-b border-line py-2', sidebarCollapsed ? 'justify-center px-2' : 'justify-between px-3')}>
                  {!sidebarCollapsed ? <span className="text-sm font-semibold text-foreground">Operations</span> : null}
                  <IconButton aria-label={sidebarCollapsed ? 'Expand navigation' : 'Collapse navigation'} onClick={toggleSidebar}>
                    <Icon name={sidebarCollapsed ? 'chevron-right' : 'chevron-left'} />
                  </IconButton>
                </div>
                <nav aria-label="Workspace navigation" className={cx('flex flex-1 flex-col gap-1 overflow-y-auto p-2', sidebarCollapsed && 'items-center')}>
                  <Navigation activePanel={activePanel} collapsed={sidebarCollapsed} items={navItems} onPanelChange={onPanelChange} />
                </nav>
              </Surface>
            </aside>
          ) : null}

          <main className="min-w-0 overflow-hidden rounded-surface border border-line bg-surface md:min-h-0">
            <div className="min-w-0 md:h-full md:overflow-hidden">{children}</div>
          </main>
        </div>
      </div>

      {mobileOpen ? (
        <div className="fixed inset-0 z-50 flex items-end bg-black/45 md:hidden" role="presentation">
          <section aria-labelledby={drawerTitleId} aria-modal="true" className="max-h-[calc(100dvh-1rem)] w-full rounded-t-surface border border-line bg-surface shadow-dialog" role="dialog">
            <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
              <h2 className="text-base font-semibold text-foreground" id={drawerTitleId}>Workspace navigation</h2>
              <IconButton aria-label="Close workspace navigation" onClick={() => setMobileOpen(false)}>
                <Icon name="close" />
              </IconButton>
            </div>
            <nav aria-label="Workspace navigation" className="grid max-h-[70dvh] gap-1 overflow-y-auto p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
              <Navigation activePanel={activePanel} items={navItems} onNavigate={() => setMobileOpen(false)} onPanelChange={onPanelChange} />
            </nav>
          </section>
        </div>
      ) : null}
    </div>
  )
}
