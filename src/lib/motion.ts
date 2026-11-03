/**
 * Motion system. Every animation on the site goes through these helpers so that
 * timing stays consistent and prefers-reduced-motion is honoured in one place.
 * Client-only: import from <script> tags or React islands, not from Astro frontmatter
 * (use ./motion-tokens there).
 */
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';
import Lenis from 'lenis';
import { prefersReducedMotion } from './device';
import { duration, ease, stagger } from './motion-tokens';
import type { CursorDetail } from './types';

gsap.registerPlugin(ScrollTrigger, SplitText);
gsap.defaults({ ease: ease.out, duration: duration.base });

export { gsap, ScrollTrigger, SplitText };
export * from './motion-tokens';

export const motionAllowed = () => !prefersReducedMotion();

/* -------------------------------------------------------------------------- */
/* Lifecycle (works with Astro's ClientRouter)                                */
/* -------------------------------------------------------------------------- */

/**
 * Run `setup` on every page load (first load and after each view transition)
 * inside a gsap.context, and revert everything before the next swap.
 * Animations created asynchronously must be wrapped in `ctx.add(() => ...)`.
 */
export function onPageLoad(setup: (ctx: gsap.Context) => void | (() => void)) {
  let ctx: gsap.Context | undefined;
  let cleanup: void | (() => void);
  document.addEventListener('astro:page-load', () => {
    // Create the context first: gsap.context(fn) runs fn before returning, so the
    // context would not exist yet inside it.
    const c = (ctx = gsap.context(() => {}));
    c.add(() => {
      cleanup = setup(c);
    });
  });
  document.addEventListener('astro:before-swap', () => {
    cleanup?.();
    ctx?.revert();
  });
}

/** Resolves once the preloader has finished (immediately if it is not shown). */
export function whenIntroDone(): Promise<void> {
  if (!document.documentElement.classList.contains('is-preloading')) return Promise.resolve();
  return new Promise((resolve) => window.addEventListener('intro:done', () => resolve(), { once: true }));
}

/* -------------------------------------------------------------------------- */
/* Smooth scroll                                                              */
/* -------------------------------------------------------------------------- */

let lenis: Lenis | null = null;
export const getLenis = () => lenis;

/** Lenis driven by GSAP's ticker so ScrollTrigger (and the 3D camera) stay in lockstep. */
export function initSmoothScroll() {
  if (lenis || !motionAllowed()) return lenis;
  // Anchor links are handled in Base.astro (they also cover "/#id" hrefs).
  lenis = new Lenis({ autoRaf: false, lerp: 0.1 });
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((time) => lenis?.raf(time * 1000));
  gsap.ticker.lagSmoothing(0);
  return lenis;
}

export function scrollToY(y: number, immediate = false) {
  if (lenis) lenis.scrollTo(y, { immediate, force: true, duration: duration.slow * 1.5 });
  else window.scrollTo({ top: y, behavior: immediate || !motionAllowed() ? 'auto' : 'smooth' });
}

export function setScrollLocked(locked: boolean) {
  if (lenis) locked ? lenis.stop() : lenis.start();
  document.documentElement.classList.toggle('scroll-locked', locked);
}

/* -------------------------------------------------------------------------- */
/* Reveal helpers                                                             */
/* -------------------------------------------------------------------------- */

interface RevealOptions {
  delay?: number;
  /** Trigger when scrolled into view (default) or play immediately. */
  scroll?: boolean;
  start?: string;
}

const showNow = (targets: gsap.TweenTarget) => gsap.set(targets, { autoAlpha: 1, clearProps: 'transform' });

/** Line / word / char reveal from behind a mask. */
export function revealText(
  el: HTMLElement,
  { by = 'lines', delay = 0, scroll = true, start = 'top 88%' }: RevealOptions & { by?: 'lines' | 'words' | 'chars' } = {}
) {
  gsap.set(el, { autoAlpha: 1 });
  if (!motionAllowed()) return;
  return SplitText.create(el, {
    type: by === 'lines' ? 'lines' : `lines,${by}`,
    mask: 'lines',
    autoSplit: true,
    onSplit: (self) =>
      gsap.from(self[by], {
        yPercent: 115,
        duration: duration.slow,
        ease: ease.out,
        stagger: by === 'chars' ? stagger.tight : stagger.base,
        delay,
        scrollTrigger: scroll ? { trigger: el, start, once: true } : undefined,
      }),
  });
}

/** Fade and rise. Pass several targets for a staggered entrance. */
export function fadeUp(
  targets: gsap.TweenTarget,
  { delay = 0, scroll = true, start = 'top 90%', y = 28, each = stagger.base }: RevealOptions & { y?: number; each?: number } = {}
) {
  if (!motionAllowed()) return showNow(targets);
  const first = gsap.utils.toArray<Element>(targets)[0];
  return gsap.fromTo(
    targets,
    { autoAlpha: 0, y },
    {
      autoAlpha: 1,
      y: 0,
      duration: duration.base,
      ease: ease.out,
      stagger: each,
      delay,
      scrollTrigger: scroll && first ? { trigger: first, start, once: true } : undefined,
    }
  );
}

/** Staggered entrance for a list of children. */
export const staggerIn = (parent: Element, selector = ':scope > *', opts?: Parameters<typeof fadeUp>[1]) =>
  fadeUp(parent.querySelectorAll(selector), { each: stagger.base, ...opts });

/* -------------------------------------------------------------------------- */
/* Marquee                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Infinite marquee. `track` must contain its content twice (the Marquee
 * component does this) so moving it by -50% loops seamlessly.
 * Scroll velocity briefly speeds it up.
 */
export function marquee(track: HTMLElement, { speed = 80, direction = -1 as 1 | -1 } = {}) {
  if (!motionAllowed()) return;
  const loopWidth = track.scrollWidth / 2;
  const tween = gsap.fromTo(
    track,
    { xPercent: direction < 0 ? 0 : -50 },
    { xPercent: direction < 0 ? -50 : 0, duration: loopWidth / speed, ease: ease.linear, repeat: -1 }
  );
  const st = ScrollTrigger.create({
    trigger: track,
    start: 'top bottom',
    end: 'bottom top',
    onUpdate: (self) => {
      const boost = 1 + Math.min(Math.abs(self.getVelocity()) / 400, 4);
      gsap.to(tween, { timeScale: boost, duration: duration.fast, overwrite: true, onComplete: () => {
        gsap.to(tween, { timeScale: 1, duration: duration.slow });
      } });
    },
  });
  return { tween, st };
}

/* -------------------------------------------------------------------------- */
/* Number counter                                                             */
/* -------------------------------------------------------------------------- */

export function counter(
  el: HTMLElement,
  { to, from = 0, decimals = 0, delay = 0, scroll = true, pad = 0 }: RevealOptions & { to: number; from?: number; decimals?: number; pad?: number }
) {
  const fmt = (n: number) => n.toFixed(decimals).padStart(pad, '0');
  if (!motionAllowed()) {
    el.textContent = fmt(to);
    return;
  }
  const state = { v: from };
  el.textContent = fmt(from);
  return gsap.to(state, {
    v: to,
    duration: duration.xslow,
    ease: 'power3.out',
    delay,
    onUpdate: () => (el.textContent = fmt(state.v)),
    scrollTrigger: scroll ? { trigger: el, start: 'top 90%', once: true } : undefined,
  });
}

/* -------------------------------------------------------------------------- */
/* Scroll-linked progress (drives the 3D camera)                              */
/* -------------------------------------------------------------------------- */

export function scrubProgress(
  trigger: Element,
  onUpdate: (progress: number) => void,
  { start = 'top top', end = 'bottom bottom' } = {}
) {
  return ScrollTrigger.create({ trigger, start, end, onUpdate: (self) => onUpdate(self.progress) });
}

/** Scroll the page so that `trigger`'s scrub progress equals `progress` (0–1). */
export function scrollToProgress(trigger: Element, progress: number) {
  const rect = trigger.getBoundingClientRect();
  const top = window.scrollY + rect.top;
  const range = trigger.scrollHeight - window.innerHeight;
  scrollToY(top + range * Math.min(Math.max(progress, 0), 1));
}

/* -------------------------------------------------------------------------- */
/* Cursor                                                                     */
/* -------------------------------------------------------------------------- */

/** Tell the custom cursor what is under the pointer (used by the 3D markers). */
export function setCursor(detail: CursorDetail) {
  window.dispatchEvent(new CustomEvent<CursorDetail>('cursor:state', { detail }));
}

/** Smoothed x/y setter for an element that follows the pointer. */
export function follower(el: HTMLElement, lag = duration.fast) {
  const x = gsap.quickTo(el, 'x', { duration: lag, ease: 'power3.out' });
  const y = gsap.quickTo(el, 'y', { duration: lag, ease: 'power3.out' });
  return (px: number, py: number) => {
    x(px);
    y(py);
  };
}
