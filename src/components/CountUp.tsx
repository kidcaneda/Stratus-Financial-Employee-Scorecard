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
