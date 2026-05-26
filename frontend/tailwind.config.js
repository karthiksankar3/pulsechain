/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        navy: {
          DEFAULT: '#0A1628',
          50: '#e8edf5',
          100: '#c5d1e8',
          200: '#9fb2d8',
          300: '#7892c8',
          400: '#5a79bd',
          500: '#3d61b2',
          600: '#2d4f9a',
          700: '#1e3a7a',
          800: '#12255a',
          900: '#0A1628',
        },
        teal: {
          DEFAULT: '#00D4B4',
          50: '#e0faf5',
          100: '#b3f3e7',
          200: '#80ecd7',
          300: '#4de5c7',
          400: '#26dfbb',
          500: '#00D4B4',
          600: '#00bfa0',
          700: '#00a589',
          800: '#008b72',
          900: '#006b56',
        },
        orange: {
          DEFAULT: '#FF6B35',
          50: '#fff1ec',
          100: '#ffddd1',
          200: '#ffc7b4',
          300: '#ffb097',
          400: '#ff9d78',
          500: '#FF6B35',
          600: '#e85e2a',
          700: '#cc5020',
          800: '#b04317',
          900: '#8c340e',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
