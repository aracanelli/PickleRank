import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [vue()],
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
    minify: 'esbuild', minify: 'esbuild',
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







