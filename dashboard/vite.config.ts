import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'
import { resolve } from 'node:path'

const companion = process.env.PADDECK_URL || 'http://localhost:47800'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    chunkSizeWarningLimit: 2000,
    rollupOptions: { input: { index: resolve(__dirname, 'index.html'), admin: resolve(__dirname, 'admin.html') } },
  },
  server: {
    host: true,
    proxy: {
      '/api': companion,
      '/media': companion,
      '/ws': { target: companion.replace('http', 'ws'), ws: true },
    },
  },
})
