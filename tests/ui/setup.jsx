import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

afterEach(() => cleanup())

vi.mock('next/link', async () => {
  const React = await import('react')
  return {
    default: React.forwardRef(function MockLink({ href, children, ...props }, ref) {
      const resolved = typeof href === 'string' ? href : href?.pathname || '/'
      return <a href={resolved} ref={ref} {...props}>{children}</a>
    }),
  }
})

vi.mock('next/navigation', () => ({
  usePathname: vi.fn(() => '/'),
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
}))

vi.mock('framer-motion', async () => {
  const React = await import('react')
  const motionProps = new Set([
    'animate',
    'exit',
    'initial',
    'layout',
    'transition',
    'variants',
    'whileHover',
    'whileInView',
    'whileTap',
    'viewport',
  ])

  return {
    AnimatePresence: ({ children }) => children,
    motion: new Proxy({}, {
      get: (_, tag) => React.forwardRef(function MotionMock({ children, ...props }, ref) {
        const clean = Object.fromEntries(
          Object.entries(props).filter(([key]) => !motionProps.has(key)),
        )
        return React.createElement(tag, { ...clean, ref }, children)
      }),
    }),
  }
})

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
})

global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
