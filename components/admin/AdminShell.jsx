'use client'

import { useEffect, useState } from 'react'

const SIDEBAR_PREFERENCE_KEY = 'faceattend:admin-sidebar-collapsed:v2'

function NavigationIcon({ itemId }) {
  const props = { className: 'h-[18px] w-[18px] shrink-0', fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24', 'aria-hidden': true }
  if (itemId === 'dashboard') return <svg {...props}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M4 4h6v6H4V4Zm10 0h6v6h-6V4ZM4 14h6v6H4v-6Zm10 0h6v6h-6v-6Z" /></svg>
  if (itemId === 'office' || itemId === 'office-settings') return <svg {...props}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M4 21h16M6 21V5a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v16M9 8h1m4 0h1M9 12h1m4 0h1M9 16h1m4 0h1" /></svg>
  if (itemId === 'employees') return <svg {...props}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M16 20v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1m11-9a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm3 4a4 4 0 0 1 4 4v1m-1-13a4 4 0 0 1 0 7.75" /></svg>
  if (itemId === 'summary') return <svg {...props}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M4 19V5m0 14h16M8 15v-3m4 3V8m4 7v-5" /></svg>
  if (itemId === 'workforce') return <svg {...props}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M7 3v3m10-3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Zm4 8 2 2 4-4" /></svg>
  if (itemId === 'roles') return <svg {...props}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M12 15a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 6a7 7 0 0 1 14 0M19 8v4m2-2h-4" /></svg>
  return <svg {...props}><circle cx="12" cy="12" r="3" strokeWidth="1.8" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M12 2.75v2.1m0 14.3v2.1M2.75 12h2.1m14.3 0h2.1M5.46 5.46l1.49 1.49m10.1 10.1 1.49 1.49m0-13.08-1.49 1.49m-10.1 10.1-1.49 1.49" /></svg>
}

function NavButton({ item, active, onClick, compact = false, collapsed = false }) {
  return (
    <button
      aria-label={collapsed ? item.label : undefined}
      className={`group relative flex items-center gap-2 border text-left text-sm font-semibold transition ${collapsed ? 'justify-center' : 'justify-between'} ${
        active
          ? 'border-navy bg-navy text-white shadow-sm'
          : item.disabled
            ? 'cursor-not-allowed border-black/5 bg-stone-50 text-muted opacity-50'
            : 'border-black/5 bg-white text-ink hover:border-black/10 hover:bg-stone-50'
      } ${collapsed
        ? 'h-11 w-11 justify-center rounded-xl p-0'
        : compact
          ? 'min-w-[6.6rem] rounded-xl px-3 py-2.5'
          : 'w-full rounded-2xl px-4 py-3'}`}
      disabled={item.disabled}
      onClick={() => onClick?.(item.id)}
      title={collapsed ? item.label : undefined}
      type="button"
    >
      <span className={`flex min-w-0 items-center gap-3 ${collapsed ? 'h-full w-full justify-center' : ''}`}>
        <NavigationIcon itemId={item.id} />
        {!collapsed ? <span className={`truncate ${compact ? 'text-xs uppercase tracking-[0.14em]' : ''}`}>{item.label}</span> : null}
      </span>
      {item.badge && !collapsed ? (
        <span className={`inline-flex min-w-[1.5rem] items-center justify-center rounded-full px-2 py-0.5 text-[11px] font-bold ${
          active ? 'bg-white/15 text-white' : 'bg-amber-500 text-white'
        }`}>
          {item.badge > 99 ? '99+' : item.badge}
        </span>
      ) : null}
      {item.badge && collapsed ? <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-amber-500 ring-2 ring-white" /> : null}
    </button>
  )
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

  useEffect(() => {
    setSidebarCollapsed(window.localStorage.getItem(SIDEBAR_PREFERENCE_KEY) === 'true')
  }, [])

  const toggleSidebar = () => {
    setSidebarCollapsed(current => {
      const next = !current
      window.localStorage.setItem(SIDEBAR_PREFERENCE_KEY, String(next))
      return next
    })
  }

  return (
    <div className="flex min-h-[100dvh] flex-col overflow-x-hidden bg-[linear-gradient(180deg,#f6f8fc_0%,#edf2f8_100%)] text-ink md:h-[100dvh] md:overflow-hidden">
      <header className="sticky top-0 z-30 shrink-0 border-b border-black/5 bg-white/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-[1600px] items-center gap-2 px-3 py-2 sm:px-6">
          <div className="flex min-w-0 items-center gap-2 text-sm font-semibold text-ink">
            <img alt="DILG" className="h-7 w-7 shrink-0 object-contain" src="/brand/dilg-logo.svg" />
            <span className="truncate">Attendance Administration</span>
          </div>
          <div className="ml-auto flex items-center gap-2">
          {actions}

          {navItems.length > 0 ? (
          <div className="hidden gap-2 overflow-x-auto py-1 md:flex xl:hidden">
              {navItems.map((item) => (
                <NavButton
                  key={`top-nav-${item.id}`}
                  active={activePanel === item.id}
                  compact
                  item={item}
                  onClick={onPanelChange}
                />
              ))}
            </div>
          ) : null}
          </div>
        </div>
      </header>

      <div className={`mx-auto flex w-full max-w-[1600px] flex-1 flex-col px-3 py-3 sm:px-6 md:min-h-0 md:py-4 ${navItems.length > 0 ? 'pb-[calc(5.75rem+env(safe-area-inset-bottom))] md:pb-4' : 'pb-4'}`}>
        <div className={`grid flex-1 gap-3 md:min-h-0 md:gap-4 ${sidebarCollapsed ? 'xl:grid-cols-[72px_minmax(0,1fr)]' : 'xl:grid-cols-[280px_minmax(0,1fr)]'}`}>
          <aside className="hidden min-h-0 xl:block">
            <div className="flex h-full flex-col overflow-hidden rounded-[1.75rem] border border-black/5 bg-white shadow-sm">
              <div className={`flex items-center border-b border-black/5 py-4 ${sidebarCollapsed ? 'justify-center px-2' : 'justify-between px-5'}`}>
                {!sidebarCollapsed ? <div className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Navigation</div> : null}
                <button
                  aria-label={sidebarCollapsed ? 'Expand navigation' : 'Collapse navigation'}
                  className="flex h-9 w-9 items-center justify-center rounded-xl border border-black/10 bg-white text-sm font-bold text-navy transition hover:bg-stone-100"
                  onClick={toggleSidebar}
                  title={sidebarCollapsed ? 'Expand navigation' : 'Collapse navigation'}
                  type="button"
                >
                  {sidebarCollapsed ? '›' : '‹'}
                </button>
              </div>
              <nav className={`flex flex-1 flex-col gap-2 overflow-y-auto ${sidebarCollapsed ? 'items-center p-2' : 'p-4'}`}>
                {navItems.map((item) => (
                  <NavButton
                    key={item.id}
                    active={activePanel === item.id}
                    collapsed={sidebarCollapsed}
                    item={item}
                    onClick={onPanelChange}
                  />
                ))}
              </nav>
            </div>
          </aside>

          <main className="min-w-0 rounded-[1.25rem] border border-black/5 bg-white shadow-sm md:min-h-0 md:overflow-hidden md:rounded-[1.75rem]">
            <div className="min-w-0 md:h-full md:overflow-hidden">
              {children}
            </div>
          </main>
        </div>

      </div>

      {navItems.length > 0 ? (
        <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-black/5 bg-white/95 px-2 pb-[calc(0.65rem+env(safe-area-inset-bottom))] pt-2 backdrop-blur md:hidden">
          <div className="mx-auto flex max-w-[1600px] gap-2 overflow-x-auto pb-1">
            {navItems.map((item) => (
              <NavButton
                key={`bottom-nav-${item.id}`}
                active={activePanel === item.id}
                compact
                item={item}
                onClick={onPanelChange}
              />
            ))}
          </div>
        </nav>
      ) : null}
    </div>
  )
}
