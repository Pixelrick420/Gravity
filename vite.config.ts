import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';

// GitHub Pages serves project sites under /<repo-name>/, so the build must
// prefix asset URLs. Local dev and other hosts stay at the root.
const base = process.env.PAGES_BASE ?? '/';

export default defineConfig({
  base,
  plugins: [svelte(), tailwindcss()],
});
