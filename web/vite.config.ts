/// <reference types="vitest/config" />
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
  // Tests live beside the module they cover, same as the server's
  // `src/lib/*.test.ts`. `environment: 'node'` because everything under test
  // today is a pure function; the component tests the later surfaces need
  // (the topic confirmation strip, per-edit accept/reject, the drop zone)
  // will opt into jsdom per file with a `// @vitest-environment jsdom`
  // pragma rather than slowing every pure test down with a DOM.
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
})
