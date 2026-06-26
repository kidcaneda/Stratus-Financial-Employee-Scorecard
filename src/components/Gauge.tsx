"use client";

import { useEffect, useState } from "react";
import { Status } from "@/types";
import { useCountUp } from "@/components/CountUp";

// Semicircular gauge meter (the BI-dashboard signature from the references).
// Animated sweep on mount; count-up center value. Color follows status.
export function Gauge({
  value,
  status,
  label,
  size = 200,
  caption,
}: {
  value: number; // 0–100
  status: Status;
  label?: string;
  size?: number;
  caption?: string;
}) {
  const pct = Math.max(0, Math.min(100, value));
  const stroke = 16;
  const r = (size - stroke) / 2;
  const cx = size / 2;
  const cy = size / 2;
  // Semicircle: 180° arc from left (180°) to right (0°).
  const semi = Math.PI * r; // length of the half circle
  const [drawn, setDrawn] = useState(false);

  useEffect(() => {
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return setDrawn(true);
    const t = requestAnimationFrame(() => setDrawn(true));
    return () => cancelAnimationFrame(t);
  }, []);

  const counted = useCountUp(pct);
  const dash = semi;
  const offset = drawn ? semi - (pct / 100) * semi : semi;

  const color =
    status === "green" ? "#34D399" : status === "amber" ? "#FBBF24" : "#F87171";

  // Arc path: left-bottom to right-bottom over the top (semicircle).
  const arc = `M ${stroke / 2} ${cy} A ${r} ${r} 0 0 1 ${size - stroke / 2} ${cy}`;

  return (
    <div className="flex flex-col items-center" style={{ width: size }}>
      <div style={{ height: size / 2 + 8 }} className="relative w-full">
        <svg width={size} height={size / 2 + stroke} className="overflow-visible">
          <defs>
            <linearGradient id={`g-${status}`} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor={color} stopOpacity="0.5" />
              <stop offset="100%" stopColor={color} />
            </linearGradient>
          </defs>
          {/* track */}
          <path d={arc} fill="none" stroke="#26334D" strokeWidth={stroke} strokeLinecap="round" />
          {/* value */}
          <path
            d={arc}
            fill="none"
            stroke={`url(#g-${status})`}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={dash}
            strokeDashoffset={offset}
            style={{ transition: "stroke-dashoffset 1s cubic-bezier(0.16,1,0.3,1)" }}
          />
        </svg>
        <div
          className="absolute inset-x-0 flex flex-col items-center"
          style={{ top: size / 4 }}
        >
          <span className="text-3xl font-semibold tabular-nums text-ink">
            {counted.toFixed(0)}
            <span className="text-lg text-ink-muted">%</span>
          </span>
          {label && (
            <span className="text-[11px] uppercase tracking-wide text-ink-muted">
              {label}
            </span>
          )}
        </div>
      </div>
      {caption && <div className="mt-1 text-xs text-ink-soft">{caption}</div>}
    </div>
  );
}
