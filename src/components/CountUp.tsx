"use client";

import { useEffect, useRef, useState } from "react";

// Animates a number from 0 to `value` once, on mount. Respects reduced
// motion (jumps straight to the value). The signature "instrument settling"
// moment — used on headline scores, not everywhere.
export function useCountUp(value: number, durationMs = 900): number {
  const [display, setDisplay] = useState(0);
  const raf = useRef<number>();

  useEffect(() => {
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setDisplay(value);
      return;
    }

    const start = performance.now();
    const from = 0;
    const ease = (t: number) => 1 - Math.pow(1 - t, 3); // cubic ease-out

    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      setDisplay(from + (value - from) * ease(t));
      if (t < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [value, durationMs]);

  return display;
}

// Eases the displayed number toward a *moving* target. Unlike useCountUp
// (which animates once from 0 on mount), this re-springs every time `value`
// changes — used for live figures that update as a leader types scores.
// Respects reduced motion (snaps instantly).
export function useEaseTo(value: number, durationMs = 450): number {
  const [display, setDisplay] = useState(value);
  const raf = useRef<number>();
  const fromRef = useRef(value);

  useEffect(() => {
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setDisplay(value);
      return;
    }

    const from = fromRef.current;
    const start = performance.now();
    const ease = (t: number) => 1 - Math.pow(1 - t, 3);

    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const current = from + (value - from) * ease(t);
      setDisplay(current);
      fromRef.current = current;
      if (t < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [value, durationMs]);

  return display;
}

// Renders a count-up number with fixed decimals.
export function CountUp({
  value,
  digits = 0,
  className,
}: {
  value: number;
  digits?: number;
  className?: string;
}) {
  const n = useCountUp(value);
  return (
    <span className={className}>
      {n.toLocaleString("en-US", {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      })}
    </span>
  );
}
