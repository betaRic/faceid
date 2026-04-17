import './globals.css'
import { Analytics } from '@vercel/analytics/react'
import { SpeedInsights } from '@vercel/speed-insights/next'
import { JetBrains_Mono, Poppins } from 'next/font/google'
import AppProviders from '@/components/AppProviders'

const poppins = Poppins({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700', '800', '900'],
  style: ['normal', 'italic'],
  display: 'swap',
  variable: '--font-poppins',
})

const jetBrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  display: 'swap',
  variable: '--font-jetbrains-mono',
})

export const metadata = {
  title: 'FaceAttend — DILG Region XII',
  description: 'Biometric face attendance system for DILG Region XII government offices. GPS-validated, server-enforced attendance tracking.',
  icons: {
    icon: '/favicon.ico',
  },
}

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${poppins.variable} ${jetBrainsMono.variable}`} data-scroll-behavior="smooth">
      <body className="font-sans">
        <AppProviders>{children}</AppProviders>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  )
}

