import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [
    vue(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'favicon.ico', 'apple-touch-icon.png', 'brand-mark.svg'],
      manifest: {
        name: 'PickleRank',
        short_name: 'PickleRank',
        description: 'Your league. Broadcast-grade. 2v2 pickleball matchmaking and rankings.',
        display: 'standalone',
        start_url: '/',
        // Hand-synced with src/app/core/brand/brand-constants.ts (dark surfacePage)
        theme_color: '#0a0c10',
        background_color: '#0a0c10',
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
        navigateFallback: '/index.html',
        // Never let the SPA fallback or caches touch the API or Clerk flows
        navigateFallbackDenylist: [/^\/api\//, /__clerk/],
        runtimeCaching: [
          {
            // Authed data must never enter Cache Storage (it outlives sign-out)
            urlPattern: /^https?:\/\/[^/]+\/api\//,
            handler: 'NetworkOnly'
          },
          {
            // Immutable font binaries
            urlPattern: /^https:\/\/fonts\.gstatic\.com\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts',
              expiration: { maxEntries: 12, maxAgeSeconds: 60 * 60 * 24 * 365 }
            }
          },
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\//,
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'google-fonts-css' }
          }
        ]
      },
      devOptions: { enabled: false }
    })
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  build: {
    rollupOptions: {
      output: {
        // Split vendor chunks for better caching
        manualChunks: {
          'vendor-chart': ['chart.js', 'vue-chartjs'],
          'vendor-clerk': ['@clerk/clerk-js'],
          'vendor-core': ['vue', 'vue-router', 'pinia']
        }
      }
    },
    target: 'esnext',
    // Use esbuild (default, faster than terser) with console/debugger removal
    minify: 'esbuild',
    // Note: esbuild drop options require Vite 4.0+ 
    // Console logs will be minified but not fully removed without terser
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true
      }
    }
  }
})







