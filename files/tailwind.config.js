/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,jsx}',
    './components/**/*.{js,jsx}',
    './hooks/**/*.{js,jsx}',
    './lib/**/*.{js,jsx}',
  ],
  theme: {
    extend: {
      colors: {
        canvas: '#f4efe6',
        ink: '#2a2017',
        muted: '#6e5b4d',
        brand: {
          DEFAULT: '#0c6c58',
          dark: '#094f41',
          soft: '#d9efe9',
        },
        accent: {
          DEFAULT: '#cf7a2d',
          soft: '#f4dfca',
        },
        sand: {
          DEFAULT: '#fffaf2',
          strong: '#efe3d2',
        },
        warn: '#c84e2f',
      },
      fontFamily: {
        sans: ['Outfit', 'sans-serif'],
        display: ['Space Grotesk', 'sans-serif'],
      },
      boxShadow: {
        glow: '0 8px 32px rgba(73, 42, 16, 0.10)',
        card: '0 2px 8px rgba(0,0,0,0.06)',
      },
      backgroundImage: {
        'hero-wash': [
          'radial-gradient(ellipse 60% 40% at top left, rgba(207, 122, 45, 0.13), transparent)',
          'radial-gradient(ellipse 50% 35% at top right, rgba(12, 108, 88, 0.10), transparent)',
          'linear-gradient(180deg, #f9f6f0 0%, #f4efe6 100%)',
        ].join(', '),
      },
      borderRadius: {
        '2xl': '1rem',
        '3xl': '1.5rem',
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease-out',
        'slide-up': 'slideUp 0.35s ease-out',
      },
      keyframes: {
        fadeIn: {
          from: { opacity: 0 },
          to: { opacity: 1 },
        },
        slideUp: {
          from: { opacity: 0, transform: 'translateY(12px)' },
          to: { opacity: 1, transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
}
