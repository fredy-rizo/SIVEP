/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        unal: {
          primary: '#8B1E3F',
          accent: '#5B8C4E',
          // Verde oscurecido para texto y botones: el acento base (#5B8C4E)
          // con blanco solo da 3.96:1; este tono da ~6.7:1 (WCAG AA 4.5:1).
          'accent-dark': '#3F6537',
          secondary: '#4A4A4A',
          background: '#F8F9FA',
          'primary-light': '#A83C5A',
          'accent-light': '#7AB56B',
          'secondary-light': '#6B6B6B'
        }
      },
      fontFamily: {
        inter: ['Inter', 'sans-serif']
      }
    },
  },
  plugins: [],
}