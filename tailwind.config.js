// Brand tokens mirror alkebuleum.org. Themed colors resolve through CSS
// variables (see src/index.css) so light/dark share the same class names.
module.exports = {
  darkMode: 'class',
  content: [
    "./public/index.html",
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        display: ['"Space Grotesk"', 'Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      colors: {
        bg: 'rgb(var(--bg) / <alpha-value>)',
        surface: 'rgb(var(--surface) / <alpha-value>)',
        'surface-2': 'rgb(var(--surface-2) / <alpha-value>)',
        ink: 'rgb(var(--ink) / <alpha-value>)',
        'ink-dim': 'rgb(var(--ink-dim) / <alpha-value>)',
        'ink-mute': 'rgb(var(--ink-mute) / <alpha-value>)',
        line: 'var(--line)',
        'line-2': 'var(--line-2)',
        accent: 'rgb(var(--accent) / <alpha-value>)',
        violet: {
          DEFAULT: '#8b6dff',
          deep: '#5e3aff',
          light: '#efeaff',
        },
        lavender: '#c6b6ff',
        gold: '#c9993d',
      },
      borderRadius: { xl: '14px', '2xl': '18px' },
      keyframes: {
        pulseDot: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '.35' },
        },
      },
      animation: { 'pulse-dot': 'pulseDot 2s ease-in-out infinite' },
    },
  },
  plugins: [],
}
