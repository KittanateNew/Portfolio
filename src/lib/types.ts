import type { ImageMetadata } from 'astro';

export type TimelineType = 'birth' | 'education' | 'job' | 'move' | 'achievement' | 'personal';

/** Serializable timeline entry: passed as props into the React 3D island. */
export interface TimelineEntryView {
  id: string;
  title: string;
  type: TimelineType;
  start: string;
  end: string | null;
  location: string;
  description: string;
  color: string;
  /** Optimised image URL, if the entry has one. */
  image: string | null;
}

export interface ProjectView {
  slug: string;
  title: string;
  summary: string;
  date: string;
  tech: readonly string[];
  liveUrl: string | null;
  repoUrl: string | null;
  featured: boolean;
  cover: ImageMetadata | undefined;
  gallery: { src: ImageMetadata | undefined; alt: string }[];
  bodyAst: string;
}

export type CursorState = 'default' | 'link' | 'marker' | 'hidden';

export interface CursorDetail {
  state: CursorState;
  label?: string;
}

/** Formats "YYYY-MM-DD" as e.g. "Jul 2018". */
export function monthYear(date: string | null | undefined): string {
  if (!date) return '';
  const [y, m] = date.split('-').map(Number);
  return new Date(Date.UTC(y, (m ?? 1) - 1, 1)).toLocaleDateString('en-GB', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export const year = (date: string | null | undefined) => (date ? date.slice(0, 4) : '');

export function dateRange(start: string, end: string | null | undefined, present = 'Present') {
  return `${monthYear(start)} – ${end ? monthYear(end) : present}`;
}
