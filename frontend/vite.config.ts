import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [vue(), tailwindcss()],
  // Le build atterrit directement là où Go l'embarque (embed.FS ne lit pas hors du module).
  build: { outDir: '../backend/web/dist', emptyOutDir: true },
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:8090',
      '/_': 'http://127.0.0.1:8090',
    },
  },
  test: { include: ['src/**/*.test.ts'] },
})
