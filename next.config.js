/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(self), geolocation=(self), microphone=()' },
        ],
      },
    ]
  },
  turbopack: {
    resolveAlias: {
      '@tensorflow/tfjs-node': '@tensorflow/tfjs',
    },
  },
  // Fallback for older bundler
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.alias['@tensorflow/tfjs-node'] = '@tensorflow/tfjs'
    }
    return config
  },
}
module.exports = nextConfig
