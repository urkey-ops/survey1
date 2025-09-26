/** @type {import('tailwindcss').Config} */
module.exports = {
  // UPDATED: Use glob patterns to check all relevant file types across the project
  content: [
    // 1. Check all HTML files in the root folder (like index.html)
    "./*.html",
    
    // 2. Check all JavaScript files in the root and all subdirectories
    // This covers app.js, and any JS files you might add in 'src/', 'api/', etc.
    "./**/*.js",
    
    // You can remove the two previous lines if you use the two lines above,
    // but keeping them doesn't hurt and offers explicit paths:
    // "./index.html", 
    // "./app.js"
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
