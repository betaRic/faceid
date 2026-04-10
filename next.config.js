/** @type {import('next').NextConfig} */

const securityHeaders = [
  { key: 'X-DNS-Prefetch-Control', value: 'on' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-XSS-Protection', value: '1; mode=block' },
  {
    key: 'Permissions-Policy',
    value: 'camera=self, geolocation=self, microphone=()',
  },
]

const nextConfig = {
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: securityHeaders,
      },
    ]
  },

  webpack(config, { isServer }) {
    // Suppress face-api.js dynamic require warning — known upstream issue, not fixable here
    config.ignoreWarnings = [
      { module: /face-api\.esm\.js/, message: /Critical dependency/ },
    ]
    return config
  },

  poweredByHeader: false,
  compress: true,
}

module.exports = nextConfig


