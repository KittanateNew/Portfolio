/**
 * Motion tokens: plain data, safe to import on the server and the client.
 * The CSS mirrors live in src/styles/tokens.css (--ease-*, --dur-*). Keep them in sync.
 */
export const ease = {
  /** Default entrance: fast start, long settle. CSS: cubic-bezier(0.16, 1, 0.3, 1) */
  out: 'expo.out',
  /** Page-level moves and wipes. CSS: cubic-bezier(0.65, 0, 0.35, 1) */
  inOut: 'power3.inOut',
  /** Small UI feedback. CSS: cubic-bezier(0.33, 1, 0.68, 1) */
  soft: 'power2.out',
  /** Playful overshoot for micro-details. */
  pop: 'back.out(1.7)',
  linear: 'none',
} as const;

/** Seconds (GSAP). */
export const duration = {
  fast: 0.35,
  base: 0.7,
  slow: 1.1,
  xslow: 1.6,
} as const;

export const stagger = {
  tight: 0.025,
  base: 0.07,
  loose: 0.14,
} as const;

/** CSS-side equivalents for Astro's transition:animate (ms + cubic-bezier). */
export const css = {
  easeOut: 'cubic-bezier(0.16, 1, 0.3, 1)',
  easeInOut: 'cubic-bezier(0.65, 0, 0.35, 1)',
  fast: 350,
  base: 700,
} as const;

/** Page transition used by the ClientRouter (<main transition:animate={pageTransition}>). */
export const pageTransition = {
  forwards: {
    old: { name: 'page-out', duration: `${css.fast}ms`, easing: css.easeInOut, fillMode: 'both' },
    new: { name: 'page-in', duration: `${css.base}ms`, easing: css.easeOut, delay: `${css.fast / 2}ms`, fillMode: 'both' },
  },
  backwards: {
    old: { name: 'page-out', duration: `${css.fast}ms`, easing: css.easeInOut, fillMode: 'both' },
    new: { name: 'page-in', duration: `${css.base}ms`, easing: css.easeOut, delay: `${css.fast / 2}ms`, fillMode: 'both' },
  },
};
