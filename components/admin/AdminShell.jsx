'use client'

function NavButton({ item, active, onClick, compact = false }) {
  return (
    <button
      className={`group flex items-center justify-between gap-2 rounded-2xl border px-4 py-3 text-left text-sm font-semibold transition ${
        active
          ? 'border-navy bg-navy text-white shadow-sm'
          : item.disabled
            ? 'cursor-not-allowed border-black/5 bg-stone-50 text-muted opacity-50'
            : 'border-black/5 bg-white text-ink hover:border-black/10 hover:bg-stone-50'
      } ${compact ? 'min-w-[8.5rem]' : 'w-full'}`}
      disabled={item.disabled}
      onClick={() => onClick?.(item.id)}
      type="button"
    >
      <span className={`truncate ${compact ? 'text-xs uppercase tracking-[0.14em]' : ''}`}>
        {item.label}
      </span>
      {item.badge ? (
        <span className={`inline-flex min-w-[1.5rem] items-center justify-center rounded-full px-2 py-0.5 text-[11px] font-bold ${
          active ? 'bg-white/15 text-white' : 'bg-amber-500 text-white'
        }`}>
          {item.badge > 99 ? '99+' : item.badge}
        </span>
      ) : null}
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
  const activeItem = navItems.find(item => item.id === activePanel) || navItems[0] || null

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-[linear-gradient(180deg,#f6f8fc_0%,#edf2f8_100%)] text-ink">
      <header className="border-b border-black/5 bg-white/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-4 px-4 py-4 sm:px-6">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div className="min-w-0 flex-1">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-navy-dark">
                Admin workspace
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-semibold text-ink sm:text-2xl">
                  {activeItem?.label || 'Operations'}
                </h1>
                <span className="rounded-full border border-black/5 bg-stone-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
                  {roleScope === 'regional' ? 'Regional control' : 'Office control'}
                </span>
              </div>
              <p className="mt-1 text-sm text-muted">
                Mobile-first operations with server-enforced controls and low-scroll panels.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 md:justify-end">
              {actions}
            </div>
          </div>

          {navItems.length > 0 ? (
            <div className="hidden gap-2 overflow-x-auto pb-1 md:flex xl:hidden">
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
      </header>

      <div className="mx-auto flex min-h-0 w-full max-w-[1600px] flex-1 flex-col px-4 py-4 sm:px-6">
        <div className="grid min-h-0 flex-1 gap-4 xl:grid-cols-[280px_minmax(0,1fr)]">
          <aside className="hidden min-h-0 xl:block">
            <div className="flex h-full flex-col overflow-hidden rounded-[1.75rem] border border-black/5 bg-white shadow-sm">
              <div className="border-b border-black/5 px-5 py-4">
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Navigation</div>
              </div>
              <nav className="flex flex-1 flex-col gap-2 overflow-y-auto p-4">
                {navItems.map((item) => (
                  <NavButton
                    key={item.id}
                    active={activePanel === item.id}
                    item={item}
                    onClick={onPanelChange}
                  />
                ))}
              </nav>
              <div className="border-t border-black/5 px-5 py-4 text-xs text-muted">
                Optimized for low-scroll daily admin work.
              </div>
            </div>
          </aside>

          <main className="min-h-0 overflow-hidden rounded-[1.75rem] border border-black/5 bg-white shadow-sm">
            <div className="h-full overflow-hidden">
              {children}
            </div>
          </main>
        </div>

        <footer className="mt-4 flex min-h-11 items-center justify-between rounded-2xl border border-black/5 bg-white/85 px-4 py-2 text-[11px] text-muted backdrop-blur">
          <span>DILG Region XII attendance workspace</span>
          <span>{activeItem?.label || 'Workspace'} panel</span>
        </footer>
      </div>

      {navItems.length > 0 ? (
        <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-black/5 bg-white/95 px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 backdrop-blur md:hidden">
          <div className="mx-auto flex max-w-[1600px] gap-2 overflow-x-auto">
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
