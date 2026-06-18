/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Sedona — muted desert earth
        sand:   '#F3EEE5',   // page background
        bone:   '#FBF8F2',   // raised surface
        shell:  '#FFFDF9',   // cards
        line:   '#E6DCCB',   // hairlines
        'line-soft': '#EFE7D9',
        ink:    '#352E27',   // primary text (warm near-black)
        slate:  '#5C5246',   // secondary text
        muted:  '#8C8173',   // tertiary text
        clay:   { DEFAULT:'#BC6B47', soft:'#D69A78', deep:'#9C5436' }, // terracotta — primary accent
        rust:   '#A14A35',
        canyon: '#7C4A36',   // deep brown
        ochre:  '#C99A4B',   // gold
        sage:   { DEFAULT:'#7E8C6A', soft:'#9CA98C', deep:'#5F6E4E' }, // muted green
        sky:    '#7E97A6',   // dusty blue
        sandstone: '#CBA877',
      },
      fontFamily: {
        display: ['Fraunces', 'Georgia', 'serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      borderRadius: { xl2: '1.1rem' },
      boxShadow: {
        soft: '0 1px 2px rgba(53,46,39,.04), 0 8px 24px -14px rgba(53,46,39,.18)',
        lift: '0 2px 6px rgba(53,46,39,.06), 0 18px 40px -20px rgba(53,46,39,.30)',
      },
      keyframes: {
        rise: { '0%': { opacity: 0, transform: 'translateY(8px)' }, '100%': { opacity: 1, transform: 'none' } },
        pulse2: { '0%,100%': { opacity: .55, r: 8 }, '50%': { opacity: 0, r: 15 } },
      },
      animation: { rise: 'rise .4s ease both' },
    },
  },
  plugins: [],
}
