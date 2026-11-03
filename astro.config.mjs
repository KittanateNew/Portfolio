// @ts-check
import { defineConfig, fontProviders } from 'astro/config';

import react from '@astrojs/react';
import markdoc from '@astrojs/markdoc';
import keystatic from '@keystatic/astro';
import cloudflare from '@astrojs/cloudflare';
import tailwindcss from '@tailwindcss/vite';

// Keystatic's local storage writes to src/content with node:fs, which workerd
// can't do, so `astro dev` runs in Node without the Cloudflare adapter.
const isDev = process.argv.includes('dev');

// https://astro.build/config
export default defineConfig({
  // Used for canonical URLs, Open Graph and the sitemap-like meta. Set SITE_URL in Cloudflare.
  site: process.env.SITE_URL ?? 'https://example.com',

  // Public pages are prerendered (static output). Only Keystatic's injected
  // /keystatic and /api/keystatic routes run on demand in the Worker.
  output: 'static',
  integrations: [react(), markdoc(), keystatic()],
  adapter: isDev
    ? undefined
    : cloudflare({
        // Pages read Keystatic content from disk with node:fs at build time,
        // so prerender in Node rather than in workerd.
        prerenderEnvironment: 'node',
      }),

  // Fonts are downloaded at build time and self-hosted from /_astro (font-display: swap).
  // DESIGN: final type pairing to be confirmed in the design session.
  fonts: [
    {
      provider: fontProviders.google(),
      name: 'Bricolage Grotesque',
      cssVariable: '--ff-display',
      weights: ['400 800'],
      styles: ['normal'],
      subsets: ['latin'],
      display: 'swap',
      fallbacks: ['Arial Narrow', 'sans-serif'],
    },
    {
      provider: fontProviders.google(),
      name: 'Geist',
      cssVariable: '--ff-body',
      weights: ['400 600'],
      styles: ['normal'],
      subsets: ['latin'],
      display: 'swap',
      fallbacks: ['system-ui', 'sans-serif'],
    },
    {
      provider: fontProviders.google(),
      name: 'Geist Mono',
      cssVariable: '--ff-mono',
      weights: ['400'],
      styles: ['normal'],
      subsets: ['latin'],
      display: 'swap',
      fallbacks: ['ui-monospace', 'monospace'],
    },
  ],

  prefetch: { prefetchAll: false, defaultStrategy: 'hover' },

  vite: {
    plugins: [tailwindcss()],
  },
});
