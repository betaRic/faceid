export default function manifest() {
  return {
    name: 'VeriFace Attendance Management System',
    short_name: 'VeriFace',
    description: 'DILG Region XII face attendance management system.',
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#123b68',
    icons: [
      { src: '/veriface-icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/veriface-icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  }
}
