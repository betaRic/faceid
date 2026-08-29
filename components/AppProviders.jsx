'use client'

import { BiometricRuntimeProvider } from './BiometricRuntimeProvider'
import ThemeProvider from './ThemeProvider'

export default function AppProviders({ children }) {
  return (
    <ThemeProvider>
      <BiometricRuntimeProvider>
        {children}
      </BiometricRuntimeProvider>
    </ThemeProvider>
  )
}

