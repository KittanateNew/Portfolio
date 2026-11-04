/**
 * Build-time content access. Everything the public site shows comes through here,
 * read from the files Keystatic writes in src/content/.
 */
import { getImage } from 'astro:assets';
import { createReader } from '@keystatic/core/reader';
import keystaticConfig from '../../keystatic.config';
import { resolveImage } from './images';
import type { ProjectView, TimelineEntryView } from './types';

export const reader = createReader(process.cwd(), keystaticConfig);

const byDateDesc = <T>(get: (x: T) => string | null) => (a: T, b: T) =>
  (get(b) ?? '').localeCompare(get(a) ?? '');

/** A project's video: an uploaded file wins over a link; YouTube links become an embed. */
function toVideo(v: { file: string | null; url: string; poster: string | null; caption: string }): ProjectView['video'] {
  const src = (v.file || v.url).trim();
  if (!src) return null;
  const yt = src.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})/);
  return {
    kind: yt ? 'youtube' : 'file',
    src: yt ? `https://www.youtube-nocookie.com/embed/${yt[1]}?rel=0` : src,
    poster: v.poster,
    caption: v.caption,
  };
}

/** Markdoc AST as a string for @astrojs/markdoc's <Renderer />. */
async function astString(field: () => Promise<{ node: unknown }>) {
  const { node } = await field();
  return JSON.stringify(node);
}

export async function getProfile() {
  const p = await reader.singletons.profile.readOrThrow();
  return {
    ...p,
    bioAst: await astString(p.bio),
    photos: p.photos
      .map((ph) => ({ src: resolveImage(ph.image), alt: ph.alt }))
      .filter((ph) => ph.src),
  };
}

export const getContact = () => reader.singletons.contact.readOrThrow();
export const getSiteSettings = () => reader.singletons.siteSettings.readOrThrow();

export async function getTimeline(): Promise<TimelineEntryView[]> {
  const all = await reader.collections.lifeTimeline.all();
  return Promise.all(
    all
      .sort((a, b) => a.entry.start.localeCompare(b.entry.start))
      .map(async ({ slug, entry }) => {
        const src = resolveImage(entry.image);
        // The 3D panel is a React island, so hand it a ready-optimised URL.
        const image = src ? (await getImage({ src, width: 720, format: 'webp' })).src : null;
        return {
          id: slug,
          title: entry.title,
          type: entry.type,
          start: entry.start,
          end: entry.end,
          location: entry.location,
          description: entry.description,
          color: entry.markerColor,
          image,
        };
      })
  );
}

export async function getExperience() {
  const all = await reader.collections.experience.all();
  return all
    .sort(byDateDesc((x) => x.entry.start))
    .map(({ slug, entry }) => ({ slug, ...entry, logo: resolveImage(entry.logo) }));
}

export async function getEducation() {
  const all = await reader.collections.education.all();
  return all.sort(byDateDesc((x) => x.entry.start)).map(({ slug, entry }) => ({ slug, ...entry }));
}

export async function getSkills() {
  const all = await reader.collections.skills.all();
  return all
    .map(({ slug, entry }) => ({ slug, ...entry }))
    .sort((a, b) => b.level - a.level || a.name.localeCompare(b.name));
}

export async function getProjects(): Promise<ProjectView[]> {
  const all = await reader.collections.projects.all();
  return Promise.all(
    all
      .sort((a, b) => Number(b.entry.featured) - Number(a.entry.featured) || byDateDesc<typeof a>((x) => x.entry.date)(a, b))
      .map(async ({ slug, entry }) => ({
        slug,
        title: entry.title,
        summary: entry.summary,
        date: entry.date,
        tech: entry.tech,
        liveUrl: entry.liveUrl,
        repoUrl: entry.repoUrl,
        video: toVideo(entry.video),
        links: entry.links
          .map((l) => ({ label: l.label, kind: l.kind, href: (l.file || l.url).trim() }))
          .filter((l) => l.href)
          .map((l) => ({ ...l, external: /^https?:\/\//.test(l.href) })),
        featured: entry.featured,
        cover: resolveImage(entry.cover),
        gallery: entry.gallery
          .map((g) => ({ src: resolveImage(g.image), alt: g.alt }))
          .filter((g) => g.src),
        bodyAst: await astString(entry.body),
      }))
  );
}
