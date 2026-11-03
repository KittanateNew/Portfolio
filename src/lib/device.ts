/**
 * Client-side capability checks. Safe to import on the server (every check
 * returns the conservative answer when `window` is missing).
 */
const mq = (q: string) => typeof window !== 'undefined' && window.matchMedia(q).matches;

export const prefersReducedMotion = () => mq('(prefers-reduced-motion: reduce)');

/** No fine pointer with hover: phones, tablets, most touch-first devices. */
export const isTouch = () => mq('(hover: none), (pointer: coarse)');

export const isSmallScreen = () => mq('(max-width: 767px)');

type NavigatorHints = Navigator & {
  deviceMemory?: number;
  connection?: { saveData?: boolean; effectiveType?: string };
};

export function isLowPower(): boolean {
  if (typeof navigator === 'undefined') return true;
  const nav = navigator as NavigatorHints;
  const cores = nav.hardwareConcurrency ?? 8;
  const memory = nav.deviceMemory ?? 8;
  const slowNet = nav.connection?.saveData || /(^|-)2g$/.test(nav.connection?.effectiveType ?? '');
  return cores < 4 || memory < 4 || Boolean(slowNet);
}

function hasWebGL(): boolean {
  try {
    const c = document.createElement('canvas');
    return Boolean(c.getContext('webgl2') ?? c.getContext('webgl'));
  } catch {
    return false;
  }
}

/**
 * Whether to mount the interactive 3D scene.
 * Override for testing with ?3d=1 or ?3d=0 in the URL.
 */
export function canRender3D(): boolean {
  if (typeof window === 'undefined') return false;
  const force = new URLSearchParams(location.search).get('3d');
  if (force === '1') return hasWebGL();
  if (force === '0') return false;
  if (prefersReducedMotion() || isTouch() || isSmallScreen() || isLowPower()) return false;
  return hasWebGL();
}

/** The custom cursor only makes sense with a fine, hovering pointer and motion allowed. */
export const canUseCustomCursor = () => !isTouch() && !prefersReducedMotion();
