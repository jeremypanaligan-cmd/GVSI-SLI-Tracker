import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub Pages subpath — change this if deploying to a custom domain
const base = process.env.GITHUB_ACTIONS ? '/GVSI-SLI-Tracker/' : '/'

export default defineConfig({
  base,
  plugins: [react()],
  server: {
    host: 'localhost',
    port: 5173,
  },
})
