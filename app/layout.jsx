import './globals.css'

export const metadata = {
  title: 'DILG Region 12 Workforce Attendance Suite',
  description: 'Mobile-first attendance system blueprint for regional, provincial, and HUC offices.',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
