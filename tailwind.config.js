// tailwind.config.js
module.exports = {
  darkMode: 'class',
  content: [
    "./public/index.html",                  // CRA
    "./src/**/*.{js,jsx,ts,tsx}",           // your source files
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui'],
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      colors: {
        brand: {
          50: '#f6f8ff',
          100: '#edf0ff',
          500: '#0f172a',    // “ink” accent (deep slate)
          600: '#0b1225',
        },
      },
      boxShadow: {
        card: '0 1px 2px 0 rgba(0,0,0,0.06), 0 1px 3px 0 rgba(0,0,0,0.04)',
      },
      borderRadius: { xl: '1rem', '2xl': '1.25rem' },
      container: { center: true, padding: '1rem' },
    },
  },
  plugins: [],
}
