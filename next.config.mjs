const includeOpenVinoRuntime = process.env.INCLUDE_OPENVINO_RUNTIME === 'true'
const contentSecurityPolicyReportOnly = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' blob:",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "media-src 'self' blob:",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "frame-src 'none'",
].join('; ')

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ['openvino-node'],
  outputFileTracingIncludes: {
    '/api/**/*': [
      './public/models/human/**/*',
      './node_modules/@vladmandic/human/dist/human.node-wasm.js',
      './node_modules/@tensorflow/tfjs/package.json',
      './node_modules/@tensorflow/tfjs-core/package.json',
      './node_modules/@tensorflow/tfjs-core/dist/**/*',
      './node_modules/@tensorflow/tfjs-converter/package.json',
      './node_modules/@tensorflow/tfjs-converter/dist/**/*',
      './node_modules/@tensorflow/tfjs-backend-cpu/package.json',
      './node_modules/@tensorflow/tfjs-backend-cpu/dist/**/*',
      './node_modules/@tensorflow/tfjs-backend-wasm/package.json',
      './node_modules/@tensorflow/tfjs-backend-wasm/dist/**/*',
      './node_modules/@tensorflow/tfjs-backend-wasm/wasm-out/**/*',
    ],
  },
  outputFileTracingExcludes: includeOpenVinoRuntime
    ? {}
    : {
        '/api/**/*': [
          './node_modules/openvino-node/**/*',
          './public/models/openvino/**/*',
        ],
      },
  async headers() {
    return [
      {
        source: '/models/human/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
        ],
      },
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(self), geolocation=(self), microphone=()' },
          { key: 'Content-Security-Policy-Report-Only', value: contentSecurityPolicyReportOnly },
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
