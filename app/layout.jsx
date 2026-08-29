import './globals.css'
import AppProviders from '@/components/AppProviders'

const THEME_BOOT_SCRIPT = `(function(){var p='system';try{var s=localStorage.getItem('veriface-theme');if(s==='light'||s==='dark'||s==='system')p=s}catch(e){}var d=p==='dark'||(p==='system'&&typeof matchMedia==='function'&&matchMedia('(prefers-color-scheme: dark)').matches)?'dark':'light';var r=document.documentElement;r.dataset.theme=d;r.dataset.themePreference=p;r.style.colorScheme=d})()`

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
    <html data-theme="light" data-theme-preference="system" lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body className="font-sans antialiased">
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  )
}

