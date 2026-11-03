/**
 * Astro island for the 3D timeline. Hydrated with client:media so phones and
 * touch devices never download React; the heavy scene (three.js) is a further
 * lazy chunk, loaded only once canRender3D() agrees.
 */
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { canRender3D } from '../../lib/device';
import { gsap, scrollToProgress, scrubProgress, setCursor, ScrollTrigger } from '../../lib/motion';
import type { TimelineEntryView } from '../../lib/types';
import './timeline-scene.css';

const TimelineScene = lazy(() => import('./TimelineScene'));

interface Props {
  entries: TimelineEntryView[];
  /** id of the section that provides the scroll distance. */
  sectionId: string;
}

export default function TimelineIsland({ entries, sectionId }: Props) {
  const [on, setOn] = useState(false);
  const progress = useRef({ current: 0 }).current;

  useEffect(() => {
    const section = document.getElementById(sectionId);
    if (!section || !canRender3D()) return;

    // The 3D layout itself comes from CSS (see Timeline.astro). The list is visually
    // hidden there but must stay readable by screen readers.
    gsap.set(section.querySelectorAll('.timeline__item'), { autoAlpha: 1 });
    ScrollTrigger.refresh();
    const st = scrubProgress(section, (p) => (progress.current = p));
    setOn(true);

    return () => {
      st.kill();
      setCursor({ state: 'default' });
    };
  }, [sectionId, progress]);

  if (!on) return null;

  const select = (index: number) => {
    const section = document.getElementById(sectionId);
    if (section) scrollToProgress(section, entries.length > 1 ? index / (entries.length - 1) : 0);
  };

  return (
    <Suspense fallback={null}>
      <TimelineScene
        entries={entries}
        progress={progress}
        onSelect={select}
        onHover={(entry) => setCursor(entry ? { state: 'marker', label: 'Jump' } : { state: 'default' })}
      />
    </Suspense>
  );
}
