/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        felt: {
          900: '#0f2318',
          800: '#1a3a27',
          700: '#1e4d30',
          600: '#246038',
        },
        gold: {
          400: '#e8c847',
          500: '#d4af37',
          600: '#b8962e',
        },
        card: {
          bg: '#fafaf8',
          border: '#e2e0da',
        },
        sidebar: {
          900: '#0d1117',
          800: '#161b22',
          700: '#21262d',
          border: '#30363d',
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      boxShadow: {
        'card': '0 2px 8px rgba(0,0,0,0.4)',
        'table': '0 0 60px rgba(0,0,0,0.8), inset 0 0 80px rgba(0,0,0,0.3)',
        'glow-gold': '0 0 12px rgba(212,175,55,0.4)',
        'glow-blue': '0 0 12px rgba(59,130,246,0.5)',
      }
    },
  },
  plugins: [],
}
