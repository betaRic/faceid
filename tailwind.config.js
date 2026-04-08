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
        glow: '0 20px 60px rgba(73, 42, 16, 0.14)',
      },
      backgroundImage: {
        'hero-wash': 'radial-gradient(circle at top left, rgba(207, 122, 45, 0.18), transparent 30%), radial-gradient(circle at top right, rgba(12, 108, 88, 0.15), transparent 24%), linear-gradient(180deg, #f8f4ed 0%, #f4efe6 100%)',
      },
    },
  },
  plugins: [],
}
