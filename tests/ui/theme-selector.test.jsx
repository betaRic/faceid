import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import ThemeProvider from '@/components/ThemeProvider'
import ThemeSelector from '@/components/ThemeSelector'
import { THEME_STORAGE_KEY } from '@/lib/theme'

function renderSelector() {
  return render(<ThemeProvider><ThemeSelector /></ThemeProvider>)
}

describe('ThemeSelector', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.removeAttribute('data-theme')
    document.documentElement.removeAttribute('data-theme-preference')
  })

  it('opens a labeled menu with the current preference checked', async () => {
    renderSelector()
    const trigger = screen.getByRole('button', { name: 'Theme: System' })

    expect(trigger).toHaveClass('min-h-11', 'min-w-11')
    expect(trigger).toHaveAttribute('aria-expanded', 'false')

    await userEvent.click(trigger)

    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('menu', { name: 'Appearance' })).toBeVisible()
    expect(screen.getByRole('menuitemradio', { name: 'System' })).toHaveAttribute('aria-checked', 'true')
  })

  it('applies and persists a selected theme', async () => {
    renderSelector()
    await userEvent.click(screen.getByRole('button', { name: 'Theme: System' }))
    await userEvent.click(screen.getByRole('menuitemradio', { name: 'Dark' }))

    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark')
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark')
    expect(screen.queryByRole('menu', { name: 'Appearance' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Theme: Dark' })).toHaveFocus()
  })

  it('closes on Escape and outside interaction', async () => {
    renderSelector()
    const trigger = screen.getByRole('button', { name: 'Theme: System' })

    await userEvent.click(trigger)
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('menu', { name: 'Appearance' })).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()

    await userEvent.click(trigger)
    await userEvent.click(document.body)
    expect(screen.queryByRole('menu', { name: 'Appearance' })).not.toBeInTheDocument()
  })

  it('moves focus through choices with standard menu keys', async () => {
    renderSelector()
    await userEvent.click(screen.getByRole('button', { name: 'Theme: System' }))

    expect(screen.getByRole('menuitemradio', { name: 'System' })).toHaveFocus()
    await userEvent.keyboard('{ArrowDown}')
    expect(screen.getByRole('menuitemradio', { name: 'Light' })).toHaveFocus()
    await userEvent.keyboard('{ArrowUp}')
    expect(screen.getByRole('menuitemradio', { name: 'System' })).toHaveFocus()
    await userEvent.keyboard('{Home}')
    expect(screen.getByRole('menuitemradio', { name: 'Light' })).toHaveFocus()
    await userEvent.keyboard('{End}')
    expect(screen.getByRole('menuitemradio', { name: 'System' })).toHaveFocus()
  })
})
