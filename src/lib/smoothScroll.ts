"use client";

/**
 * A tiny registry holding the one live Lenis instance.
 *
 * Lenis scrolls the page by calling `window.scrollTo` on every frame, so the
 * usual way of freezing the page behind a dialog — setting `overflow: hidden`
 * on `<body>` — does not stop it: CSS cannot hold back a programmatic scroll.
 * Anything that takes over the screen has to tell Lenis to stand down as well,
 * and this is how it reaches it without threading the instance through props.
 */

import type Lenis from "lenis";

let instance: Lenis | null = null;

/** Called by `SmoothScroll` as the instance is created and destroyed. */
export function registerSmoothScroll(next: Lenis | null): void {
  instance = next;
}

/** Freeze Lenis while a dialog owns the screen. Safe when Lenis is not running. */
export function pauseSmoothScroll(): void {
  instance?.stop();
}

export function resumeSmoothScroll(): void {
  instance?.start();
}
