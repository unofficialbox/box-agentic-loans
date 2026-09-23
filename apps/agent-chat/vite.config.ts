import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // One .env for the repo: only VITE_-prefixed values reach the browser bundle.
  envDir: '../..',
  server: {
    port: 3003,
    open: true
  }
})
