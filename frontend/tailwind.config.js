/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        mdo: {
          50: '#f0f7ff',
          100: '#e0effe',
          200: '#bfdbfe',
          300: '#93c5fd',
          400: '#3b82f6',
          500: '#1d4ed8',
          600: '#1e40af',
          700: '#1e3a8a',
          800: '#162d6e',
          900: '#11225a',
          950: '#0b163d',
        },
      },
    },
  },
  plugins: [],
};
