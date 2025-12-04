/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        neon: {
          blue: '#00f3ff',
          yellow: '#ffe600',
          pink: '#ff00ff',
          black: '#0a0a0a',
        }
      },
      fontFamily: {
        serif: ['Times New Roman', 'serif'],
        sans: ['Arial', 'sans-serif'],
      },
    },
  },
  plugins: [],
}