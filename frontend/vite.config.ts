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




