import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx,js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#fdf3ec',
          100: '#f7e2cf',
          200: '#f1e3d3',
          300: '#e3a87c',
          400: '#d17d44',
          500: '#c0652c',
          600: '#b4521f',
          700: '#95421a',
          800: '#743315',
          900: '#4d2310',
        },
        accent: {
          500: '#c0652c',
          600: '#b4521f',
        },
        surface: {
          50: '#faf4ea',
          100: '#f1e3d3',
          200: '#e7ddca',
          600: '#5c5345',
          900: '#2a231a',
        },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        serif: ['Spectral', 'Georgia', 'serif'],
      },
      borderRadius: {
        '2xl': '1rem',
        '3xl': '1.25rem',
      },
      boxShadow: {
        card: '0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)',
        'card-hover': '0 4px 12px rgba(0,0,0,0.08), 0 2px 4px rgba(0,0,0,0.04)',
        'card-dark': '0 1px 3px rgba(0,0,0,0.3), 0 1px 2px rgba(0,0,0,0.2)',
      },
      animation: {
        'fade-up': 'fadeUp 0.25s ease-out',
        'skeleton': 'skeleton 1.4s ease-in-out infinite',
      },
      keyframes: {
        fadeUp: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        skeleton: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.4' },
        },
      },
    },
  },
} satisfies Config
