import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      // ws: true so the live-transcription WebSocket (/api/stt/live) is
      // forwarded too. Without it the upgrade never reaches the API in dev,
      // and live transcription quietly falls back to the batch upload on
      // every turn — which looks like it works, while testing nothing.
      '/api': { target: 'http://localhost:3001', ws: true },
    },
  },
})
