'use client'

import { BiometricRuntimeProvider } from './BiometricRuntimeProvider'

export default function AppProviders({ children }) {
  return (
    <BiometricRuntimeProvider>
      {children}
    </BiometricRuntimeProvider>
  )
}
