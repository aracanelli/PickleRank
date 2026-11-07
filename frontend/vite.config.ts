import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'
import { fileURLToPath, URL } from 'node:url'
import { fakeApiPlugin } from './e2e/fake-api'

// Modes used only by the test suites, never by `vite build`:
//   e2e      fake Clerk session + in-memory fake API (fixture data)
//   e2e-real fake Clerk session with a locally minted JWT against the real FastAPI on :8000
export default defineConfig(({ mode }) => {
  const fixtures = mode === 'e2e'
  const fakeClerk = mode === 'e2e' || mode === 'e2e-real'
  return {
    plugins: [
      vue(),
      ...(fixtures ? [fakeApiPlugin()] : []),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.svg', 'favicon.png', 'apple-touch-icon.png'],
        manifest: {
          name: 'PickleRank',
          short_name: 'PickleRank',
          description: 'Run league nights, score courts, and keep pickleball ladder rankings.',
          display: 'standalone',
          start_url: '/',
          // Hand-synced with src/styles/tokens.css (light --bg, --court)
          theme_color: '#f6f8fa',
          background_color: '#f6f8fa',
          icons: [
            { src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png' },
            { src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png' },
            { src: '/maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
          ]
        },
        workbox: {
          cleanupOutdatedCaches: true,
          clientsClaim: true,
          skipWaiting: true,
          // The Clerk vendor chunk is ~2.6 MB and must be precached: bootstrap dynamically
          // imports it, so an uncached chunk would break offline launches.
          maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
          navigateFallback: '/index.html',
          // Never let the SPA fallback or caches touch the API or Clerk flows
          navigateFallbackDenylist: [/^\/api\//, /__clerk/],
          runtimeCaching: [
            {
              // Authed data must never enter Cache Storage (it outlives sign-out)
              urlPattern: /^https?:\/\/[^/]+\/api\//,
              handler: 'NetworkOnly'
            }
          ]
        },
        devOptions: { enabled: false }
      })
    ],
    resolve: {
      alias: [
        ...(fakeClerk
          ? [{ find: /^@\/app\/core\/auth\/clerk$/, replacement: fileURLToPath(new URL('./src/app/core/auth/clerk.e2e.ts', import.meta.url)) }]
          : []),
        { find: '@', replacement: fileURLToPath(new URL('./src', import.meta.url)) }
      ]
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            'vendor-chart': ['chart.js', 'vue-chartjs'],
            'vendor-clerk': ['@clerk/clerk-js'],
            'vendor-core': ['vue', 'vue-router', 'pinia']
          }
        }
      },
      target: 'esnext',
      minify: 'esbuild'
    },
    server: {
      port: 5173,
      proxy: fixtures ? undefined : {
        '/api': {
          target: 'http://localhost:8000',
          changeOrigin: true
        }
      }
    }
  }
})
