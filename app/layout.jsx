import './globals.css'

export const metadata = {
  title: 'FaceAttend',
  description: 'Mobile-first attendance system blueprint for regional, provincial, and HUC offices.',
  icons: {
    icon: '/favicon.ico',
  },
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
