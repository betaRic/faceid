import './globals.css'
import AppProviders from '@/components/AppProviders'

export const metadata = {
  title: 'FaceAttend — DILG Region XII',
  description: 'Biometric face attendance system for DILG Region XII government offices. GPS-validated, server-enforced attendance tracking.',
  icons: {
    icon: '/favicon.ico',
  },
}

export default function RootLayout({ children }) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body className="font-sans">
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  )
}

