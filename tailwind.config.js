/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./app.js"
  ],
  theme: {
    extend: {
      colors: {
        'sewa-orange': '#ff6600',
        'sewa-blue': '#004d99',
      },
    },
  },
  plugins: [],
}
