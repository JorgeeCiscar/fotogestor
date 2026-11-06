import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        // imageWorker se ejecuta en un utilityProcess aparte (ver src/main/imageWorker.ts).
        input: { index: resolve(__dirname, 'src/main/index.ts'), imageWorker: resolve(__dirname, 'src/main/imageWorker.ts') }
      }
    }
  },
  preload: { plugins: [externalizeDepsPlugin()] },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    plugins: [react()]
  }
})
