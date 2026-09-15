import { defineConfig } from 'vite'

// Set VITE_BASE=/your-repo/ for GitHub Pages project sites
export default defineConfig({
  base: process.env.VITE_BASE || '/PROJX/',
})
