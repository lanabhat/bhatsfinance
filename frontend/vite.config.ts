import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [tailwindcss(), react()],
  build: {
    rolldownOptions: {
      output: {
        // Pages are lazy-loaded (App.tsx); group what they share into a few cacheable chunks
        // instead of dozens of tiny ones.
        codeSplitting: {
          groups: [
            // Small libraries used everywhere (clsx is also a Recharts dependency, which would
            // otherwise pull it — and the whole charts chunk — into the first load).
            { name: 'react', test: /node_modules[\/](react|react-dom|scheduler|clsx|tailwind-merge)[\/]/, priority: 30 },
            // Recharts and its d3/redux internals — only pages that draw charts load this.
            { name: 'charts', test: /node_modules[\/](recharts|d3-[^\/]+|victory-vendor|internmap|decimal\.js-light|eventemitter3|es-toolkit|immer|reselect|redux|@reduxjs|react-redux|use-sync-external-store|tiny-invariant)[\/]/, priority: 20 },
            // App code used by several pages (API clients, hooks, shared components).
            { name: 'app', test: /[\/]src[\/](api|lib|hooks|context|types|data|components[\/](ui|common|icons))[\/]/, priority: 10, minShareCount: 2 },
          ],
        },
      },
    },
  },
  server: {
    proxy: {
      '/api': 'http://localhost:8000',
    },
  },
})
