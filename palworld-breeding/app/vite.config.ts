import { defineConfig } from 'vite'
import preact from '@preact/preset-vite'

// https://vite.dev/config/
export default defineConfig({
  // Relative base, NOT '/'. The site is served from a subfolder
  // (/Sonsofthesilverstream/palforge/), so an absolute '/' base makes
  // index.html request /assets/*.js at the domain root — 404, blank black
  // screen, which is exactly what the CEO hit on 2026-08-15. './' resolves
  // against wherever the page actually lives, so the build is correct at any
  // path without anyone remembering to set VITE_BASE at deploy time.
  // Safe here because routing is hash-based (src/state.ts), so deep links
  // never change the directory the assets resolve from.
  base: process.env.VITE_BASE || './',
  plugins: [preact()],
})
