import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const page = (name: string) => fileURLToPath(new URL(name, import.meta.url))

export default defineConfig({
  plugins: [react()],
  // One .env for the repo: only VITE_-prefixed values reach the browser bundle.
  envDir: '../..',
  // Two pages: the copilot, and its developer tools (the API console) on their own.
  build: {
    rollupOptions: {
      input: { main: page('index.html'), devtools: page('devtools.html') }
    }
  },
  server: {
    port: 3003,
    open: true
  }
})
