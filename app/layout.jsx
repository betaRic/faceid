import './globals.css'
import AppProviders from '@/components/AppProviders'

export const metadata = {
  title: 'VeriFace Attendance Management System — DILG Region XII',
  description: 'DILG Region XII biometric attendance system with GPS-validated, server-enforced attendance tracking.',
  icons: {
    icon: '/veriface-icon-192.png',
    apple: '/veriface-icon-192.png',
  },
  manifest: '/manifest.webmanifest',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="font-sans antialiased">
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  )
}

