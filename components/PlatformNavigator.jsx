'use client'

import Link from 'next/link'
import AppShell from './AppShell'
import AddToHomeScreenButton from './AddToHomeScreenButton'
import BrandMark from './BrandMark'
import { Icon, Surface, cx } from './ui'

function EntryAction({ href, icon, title, description, primary = false, ariaLabel }) {
  return (
    <Link
      aria-label={ariaLabel || title}
      className={cx(
        'group flex min-h-16 items-center gap-4 rounded-control border px-4 py-3 transition-colors',
        primary ? 'border-primary bg-primary text-white hover:bg-primary-strong' : 'border-line bg-surface text-foreground hover:bg-canvas',
      )}
      href={href}
    >
      <span className={cx('flex h-10 w-10 shrink-0 items-center justify-center rounded-control', primary ? 'bg-white/12' : 'bg-primary/8 text-primary')}>
        <Icon name={icon} size={20} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">{title}</span>
        <span className={cx('mt-0.5 block text-xs leading-5', primary ? 'text-white/75' : 'text-secondary')}>{description}</span>
      </span>
      <Icon className="shrink-0 transition-transform group-hover:translate-x-0.5" name="arrow-right" />
    </Link>
  )
}

export default function PlatformNavigator() {
  return (
    <AppShell>
      <section className="container-fluid flex flex-1 items-center py-10 sm:py-16">
        <div className="mx-auto grid w-full max-w-5xl gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(22rem,0.8fr)] lg:items-center">
          <div>
            <BrandMark />
            <h1 className="mt-6 max-w-2xl text-3xl font-semibold tracking-tight text-primary sm:text-4xl">
              Attendance for DILG Region XII
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-secondary">
              Scan attendance or register a new employee for administrator review.
            </p>
            <div className="mt-6">
              <AddToHomeScreenButton />
            </div>
          </div>

          <Surface className="grid gap-3 p-3 sm:p-4">
            <EntryAction
              ariaLabel="Scan attendance"
              description="Use the camera and approved attendance location."
              href="/scan"
              icon="scan"
              primary
              title="Scan attendance"
            />
            <EntryAction
              ariaLabel="Register employee"
              description="Submit a guided enrollment for administrator review."
              href="/registration"
              icon="user-add"
              title="Register employee"
            />
          </Surface>
        </div>
      </section>
    </AppShell>
  )
}
