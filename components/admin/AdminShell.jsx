'use client'

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
      <header className="sticky top-0 z-40 border-b border-black/5 bg-white">
        <div className="mx-auto flex w-full max-w-[1600px] flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-navy-dark">
              Admin workspace
            </div>
            <div className="text-sm text-muted">
              {roleScope === 'regional' ? 'Regional control' : 'Office control'}
            </div>
          </div>
          {activeItem ? (
            <div className="xl:hidden">
              <div className="rounded-full bg-stone-100 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
                {activeItem.label}
              </div>
            </div>
          ) : null}
          <div className="ml-auto flex items-center gap-2">
            {actions}
          </div>
          {navItems.length > 0 ? (
            <div className="w-full xl:hidden">
              <label className="grid gap-1">
                <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">Section</span>
                <select
                  className="w-full rounded-xl border border-black/10 bg-white px-3 py-2.5 text-sm font-medium text-ink outline-none transition focus:border-navy"
                  onChange={event => onPanelChange?.(event.target.value)}
                  value={activeItem?.id || ''}
                >
                  {navItems.map(item => (
                    <option key={`mobile-select-${item.id}`} disabled={item.disabled} value={item.id}>
                      {item.badge ? `${item.label} (${item.badge > 99 ? '99+' : item.badge})` : item.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          ) : null}
        </div>
      </header>

      <div className="mx-auto grid h-full min-h-0 w-full max-w-[1600px] flex-1 gap-4 px-4 py-4 sm:px-6 xl:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="hidden min-h-0 xl:block">
          <div className="flex h-full flex-col overflow-hidden rounded-[1.6rem] border border-black/5 bg-white shadow-sm">
            <div className="border-b border-black/5 px-4 py-4">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Navigation</div>
            </div>
            <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-3">
              {navItems.map(item => {
                const active = activePanel === item.id
                return (
                  <button
                    key={item.id}
                    className={`flex items-center justify-between rounded-xl px-4 py-3 text-left text-sm font-semibold transition ${
                      active
                        ? 'bg-navy text-white shadow-sm'
                        : item.disabled
                          ? 'cursor-not-allowed opacity-40'
                          : 'text-ink hover:bg-stone-100'
                    }`}
                    disabled={item.disabled}
                    onClick={() => onPanelChange?.(item.id)}
                    type="button"
                  >
                    <span>{item.label}</span>
                    {item.badge ? (
                      <span className={`inline-flex min-w-[1.5rem] items-center justify-center rounded-full px-2 py-0.5 text-xs font-bold ${
                        active ? 'bg-white/18 text-white' : 'bg-amber-500 text-white'
                      }`}>
                        {item.badge > 99 ? '99+' : item.badge}
                      </span>
                    ) : null}
                  </button>
                )
              })}
            </nav>
            <footer className="border-t border-black/5 px-4 py-4 text-xs text-muted">
              Server-enforced controls
            </footer>
          </div>
        </aside>

        <main className="min-h-0 overflow-hidden rounded-[1.6rem] border border-black/5 bg-white shadow-sm">
          <div className="h-full overflow-y-auto">
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}
