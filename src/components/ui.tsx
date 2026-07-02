"use client";

import { useEffect, useState } from "react";
import { Period, Status } from "@/types";
import { statusClasses, fmt } from "@/lib/scoring";
import { useCountUp, useEaseTo } from "@/components/CountUp";

export function StatusPill({ status }: { status: Status }) {
  const c = statusClasses(status);
  return (
    <span className={`pill ${c.bg} ${c.text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${c.dot}`} />
      {c.label}
    </span>
  );
}

export function ScoreRing({
  value,
  status,
  size = 120,
}: {
  value: number;
  status: Status;
  size?: number;
}) {
  const c = statusClasses(status);
  const stroke = 10;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, value));

  // Sweep the arc in on mount (reduced-motion jumps to final).
  const [drawn, setDrawn] = useState(false);
  useEffect(() => {
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setDrawn(true);
      return;
    }
    const t = requestAnimationFrame(() => setDrawn(true));
    return () => cancelAnimationFrame(t);
  }, []);

  const offset = drawn ? circ - (pct / 100) * circ : circ;
  const counted = useCountUp(pct);
  const colorVar =
    status === "green" ? "#138A5E" : status === "amber" ? "#C8860C" : "#C73E3E";

  return (
    <div className="relative inline-flex" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#EEF1F4" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={colorVar}
          strokeWidth={stroke}
          strokeDasharray={circ}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 0.9s cubic-bezier(0.16, 1, 0.3, 1)" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`text-2xl font-semibold tabular-nums ${c.text}`}>
          {fmt(counted, 0)}
        </span>
        <span className="text-[10px] uppercase tracking-wide text-ink-muted">score</span>
      </div>
    </div>
  );
}

// A ring that tracks a *live* value (recomputes as data is entered) rather
// than animating once on mount. The arc and colour glide between states and
// the number eases to its new target, so a leader sees the projected score
// respond as they score each metric. `max` lets it render a 1–5 competency
// scale as well as the 0–100 KPI scale.
export function LiveScoreDial({
  value,
  status,
  max = 100,
  digits = 0,
  size = 132,
  caption = "projected",
}: {
  value: number;
  status: Status;
  max?: number;
  digits?: number;
  size?: number;
  caption?: string;
}) {
  const c = statusClasses(status);
  const stroke = 11;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const offset = circ - (pct / 100) * circ;
  const eased = useEaseTo(value);
  const color =
    status === "green" ? "#34D399" : status === "amber" ? "#FBBF24" : "#F87171";

  return (
    <div className="relative inline-flex" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="#1B2740"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeDasharray={circ}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{
            transition:
              "stroke-dashoffset 0.6s cubic-bezier(0.16,1,0.3,1), stroke 0.4s ease",
            filter: `drop-shadow(0 0 6px ${color}66)`,
          }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span
          key={status}
          className={`text-3xl font-semibold tabular-nums ${c.text} animate-pop`}
        >
          {fmt(eased, digits)}
        </span>
        <span className="text-[10px] uppercase tracking-wide text-ink-muted">
          {caption}
        </span>
      </div>
    </div>
  );
}

export function PeriodSelector({
  value,
  onChange,
}: {
  value: Period;
  onChange: (p: Period) => void;
}) {
  const periods: Period[] = ["monthly", "quarterly", "yearly"];
  return (
    <div className="inline-flex rounded-lg border border-hairline bg-surface p-0.5">
      {periods.map((p) => (
        <button
          key={p}
          onClick={() => onChange(p)}
          className={`rounded-md px-3 py-1.5 text-sm font-medium capitalize transition-all duration-150 ${
            value === p
              ? "bg-ink text-white shadow-sm"
              : "text-ink-muted hover:text-ink"
          }`}
        >
          {p}
        </button>
      ))}
    </div>
  );
}

export function MockBanner() {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-signal-amber/30 bg-signal-amberbg px-4 py-2 text-sm text-signal-amber">
      <span className="h-1.5 w-1.5 rounded-full bg-signal-amber" />
      <span><strong>Demo data.</strong> Values are placeholders. Run the Excel sync to load real scorecards.</span>
    </div>
  );
}
