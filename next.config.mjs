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
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
        ],
      },
    ]
  },
  turbopack: {
    resolveAlias: {
      '@tensorflow/tfjs-node': '@tensorflow/tfjs',
    },
  },
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.alias['@tensorflow/tfjs-node'] = '@tensorflow/tfjs'
    }
    return config
  },
}

export default nextConfig
