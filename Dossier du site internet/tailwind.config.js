/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bordeaux: {
          50: '#FDF2F4',
          100: '#FBE4E8',
          200: '#F7CBD3',
          300: '#F0A3B1',
          400: '#E56D85',
          500: '#9B1B30',
          600: '#7F011F',
          700: '#6B1124',
          800: '#520B1B',
          900: '#3D0613',
          DEFAULT: '#6B1124',
        },
        creme: {
          50: '#FFFFFF',
          100: '#FCFBF7',
          200: '#FAF6EB',
          300: '#F5EED8',
          DEFAULT: '#FAF6EB',
        },
        vert: {
          50: '#ECFDF5',
          100: '#D1FAE5',
          500: '#10B981',
          600: '#059669',
          DEFAULT: '#10B981',
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['Playfair Display', 'Georgia', 'serif'],
      }
    },
  },
  plugins: [],
}
