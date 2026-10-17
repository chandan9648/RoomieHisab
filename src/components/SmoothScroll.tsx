"use client";

import { useEffect, useState, type ReactNode } from "react";
import Lenis from "lenis";

import { registerSmoothScroll } from "@/lib/smoothScroll";

/**
 * Smooth scrolling for the whole app.
 *
 * ## Why `autoRaf`
 * Lenis does not animate by itself. It listens for wheel and touch events,
 * cancels them, accumulates a target offset, and only moves the page when its
 * `raf()` method is called on each frame. Constructing it without driving that
 * loop is therefore worse than not using it at all: the native scroll is
 * suppressed and nothing replaces it, so the page simply stops scrolling.
 * `autoRaf: true` makes Lenis run and cancel its own frame loop, and
 * `destroy()` tears it down.
 *
 * ## Why this can be switched off
 * Hijacking the scroll is motion, and some people ask their OS for less of it.
 * When `prefers-reduced-motion` is set we never construct Lenis, leaving the
 * browser's own scrolling in place.
 */
export default function SmoothScroll({ children }: { children: ReactNode }) {
  const [reduceMotion, setReduceMotion] = useState(true);

  // Starts pessimistic and is corrected on mount, so the very first paint on
  // the server and the client agree and no scroll is captured before we know.
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduceMotion(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (reduceMotion) return;

    const lenis = new Lenis({
      duration: 1.6,
      smoothWheel: true,
      anchors: true,
      autoRaf: true,
    });
    registerSmoothScroll(lenis);

    return () => {
      registerSmoothScroll(null);
      lenis.destroy();
    };
  }, [reduceMotion]);

  return <>{children}</>;
}
