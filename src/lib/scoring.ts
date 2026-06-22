import {
  Department,
  Metric,
  Period,
  ScoreResult,
  Status,
  Thresholds,
  DEFAULT_THRESHOLDS,
} from "@/types";

// Map a 0–100 attainment number to a Green/Amber/Red status.
export function statusFor(
  raw: number,
  thresholds: Thresholds = DEFAULT_THRESHOLDS
): Status {
  if (raw >= thresholds.green) return "green";
  if (raw >= thresholds.amber) return "amber";
  return "red";
}

// Attainment of a single metric vs its target (0–100, capped at 100).
// For "lower is better" metrics (e.g. error rate), the formula inverts.
export function metricAttainment(metric: Metric, period: Period): number {
  const actual = metric.actual[period];
  if (metric.target === 0) return 0;
  let raw: number;
  if (metric.higherIsBetter) {
    raw = (actual / metric.target) * 100;
  } else {
    // lower is better: hitting/beating target = 100, doubling target = 0
    raw = (2 - actual / metric.target) * 100;
  }
  return Math.max(0, Math.min(100, raw));
}

// Score a single metric for a period.
export function scoreMetric(metric: Metric, period: Period): ScoreResult {
  const raw = metricAttainment(metric, period);
  return {
    raw,
    weighted: raw * metric.weight,
    status: statusFor(raw),
  };
}

// Weighted overall score for a department in a period.
export function scoreDepartment(
  dept: Department,
  period: Period,
  thresholds: Thresholds = DEFAULT_THRESHOLDS
): ScoreResult {
  const totalWeight = dept.metrics.reduce((s, m) => s + m.weight, 0) || 1;
  const weighted = dept.metrics.reduce(
    (s, m) => s + metricAttainment(m, period) * m.weight,
    0
  );
  const raw = weighted / totalWeight;
  return { raw, weighted: raw, status: statusFor(raw, thresholds) };
}

// Tailwind class helpers for a status.
export function statusClasses(status: Status): {
  text: string;
  bg: string;
  dot: string;
  label: string;
} {
  switch (status) {
    case "green":
      return {
        text: "text-signal-green",
        bg: "bg-signal-greenbg",
        dot: "bg-signal-green",
        label: "On track",
      };
    case "amber":
      return {
        text: "text-signal-amber",
        bg: "bg-signal-amberbg",
        dot: "bg-signal-amber",
        label: "At risk",
      };
    case "red":
      return {
        text: "text-signal-red",
        bg: "bg-signal-redbg",
        dot: "bg-signal-red",
        label: "Off track",
      };
  }
}

export function fmt(n: number, digits = 1): string {
  return n.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

// Trend delta vs the prior period (quarterly compared to monthly, etc.).
// Simplified illustrative comparison for the team view.
export function trendDelta(dept: Department): number {
  const m = scoreDepartment(dept, "monthly").raw;
  const q = scoreDepartment(dept, "quarterly").raw;
  return m - q;
}
