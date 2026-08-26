import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Base path for GitHub Pages subdirectory
// Change to '/' if deploying to a custom domain
const base = '/GVSI-SLI-Tracker/'

export default defineConfig({
  base,
  plugins: [react()],
  server: {
    host: 'localhost',
    port: 5173,
  },
})
