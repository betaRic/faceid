import { Children } from 'react'
import { describe, expect, it, vi } from 'vitest'
import RootLayout from '@/app/layout'

vi.mock('@/components/AppProviders', () => ({
  default: ({ children }) => children,
}))

describe('root document theme boot', () => {
  it('places the synchronous pre-paint script inside the document head', () => {
    const root = RootLayout({ children: <main>Content</main> })
    const documentChildren = Children.toArray(root.props.children)
    const head = documentChildren.find(child => child.type === 'head')

    expect(head).toBeTruthy()
    expect(Children.toArray(head.props.children).some(child => child.type === 'script')).toBe(true)
    expect(documentChildren.some(child => child.type === 'script')).toBe(false)
  })
})
