import type { ImageMetadata } from 'astro';

/**
 * Keystatic stores image fields as "/src/assets/images/<area>/<file>".
 * Globbing the folder lets Astro's <Image>/<Picture> optimise them at build time.
 */
const files = import.meta.glob<{ default: ImageMetadata }>(
  '/src/assets/images/**/*.{jpg,jpeg,png,webp,avif,gif}',
  { eager: true }
);

export function resolveImage(path: string | null | undefined): ImageMetadata | undefined {
  if (!path) return undefined;
  const img = files[path]?.default;
  if (!img) console.warn(`[images] Not found in src/assets/images: ${path}`);
  return img;
}
