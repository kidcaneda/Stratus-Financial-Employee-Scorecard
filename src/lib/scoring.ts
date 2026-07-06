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

// Map a 1–5 competency overall score to the same Green/Amber/Red signal.
//  >= 4.0 → green (Exceeds/Outstanding), >= 3.0 → amber (Meets),
//  below 3.0 → red (Needs Improvement / Unsatisfactory).
export function competencyStatus(overall: number): Status {
  if (overall >= 4.0) return "green";
  if (overall >= 3.0) return "amber";
  return "red";
}

// Human-readable band label for a 1–5 competency overall. Mirrors the
// bands used on the source review workbook so scores read the same in the
// live score-entry form as they do on the printed scorecard.
export function competencyBand(overall: number): string {
  if (overall >= 4.5) return "Outstanding";
  if (overall >= 4.0) return "Exceeds";
  if (overall >= 3.0) return "Meets";
  if (overall >= 2.0) return "Developing";
  return "Needs improvement";
}

// A metric whose unit reads as a 1–5 rating scale (e.g. "1-5") — like
// "Responsiveness (SUPERVISOR RATING)". The workbook lists the scale
// where a numeric target would be, so the parsed target is unusable;
// these score as actual out of 5 instead of actual vs target.
export function isRatingScale(unit: string | undefined): boolean {
  return /^\s*[01]\s*[-–—]\s*5\s*$/.test(unit ?? "");
}

// Suggested 0–100 score for a KPI metric from a freshly-entered actual,
// used by the live score-entry form so a leader only has to type the
// actual and the score is computed for them (they can still override).
// Same math as metricAttainment's fallback branch, but always derives from
// the actual (never a pre-baked sheet score) since we're entering new data.
export function kpiScoreFromActual(
  actual: number,
  target: number,
  higherIsBetter: boolean,
  unit?: string
): number {
  if (isRatingScale(unit)) {
    return Math.max(0, Math.min(100, Math.round((actual / 5) * 100)));
  }
  if (!target) return 0;
  const raw = higherIsBetter
    ? (actual / target) * 100
    : (2 - actual / target) * 100;
  return Math.max(0, Math.min(100, Math.round(raw)));
}

// Attainment of a single metric vs its target (0–100, capped at 100).
// If the source sheet supplied a pre-calculated score, use it directly
// (it correctly handles complex multi-period targets). Otherwise compute
// from actual vs target. For "lower is better" metrics, the formula inverts.
export function metricAttainment(metric: Metric, period: Period): number {
  // Prefer the workbook's own score when available.
  if (metric.score && typeof metric.score[period] === "number") {
    const s = metric.score[period];
    if (s > 0) return Math.max(0, Math.min(100, s));
  }
  const actual = metric.actual[period];
  // 1–5 rating-scale metrics score as actual/5 (their target is a scale
  // label, not a number).
  if (isRatingScale(metric.unit)) {
    return Math.max(0, Math.min(100, (actual / 5) * 100));
  }
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
  // Competency departments use a 1–5 scale. For cross-department comparison
  // on the overview/list (which are 0–100), convert to an equivalent 0–100
  // (e.g. 5.0/5 → 100). The detail page still shows the native 1–5 value.
  if (dept.type === "competency" && dept.competency) {
    const raw = (dept.competency.overall / 5) * 100;
    return { raw, weighted: raw, status: competencyStatus(dept.competency.overall) };
  }
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

// ============================================================
// Phase A: employee-level scoring.
// An Employee scores exactly like a Department (same metric/competency
// shape), so we adapt it into the existing scoreDepartment logic.
// ============================================================
import { Employee } from "@/types";

// Score a single employee for a period (0–100). Mirrors scoreDepartment.
export function scoreEmployee(emp: Employee, period: Period): ScoreResult {
  if (emp.type === "competency" && emp.competency) {
    const raw = (emp.competency.overall / 5) * 100;
    return { raw, weighted: raw, status: competencyStatus(emp.competency.overall) };
  }
  const totalWeight = emp.metrics.reduce((s, m) => s + m.weight, 0) || 1;
  const weighted = emp.metrics.reduce(
    (s, m) => s + metricAttainment(m, period) * m.weight,
    0
  );
  const raw = weighted / totalWeight;
  return { raw, weighted: raw, status: statusFor(raw) };
}

// Roll a department's employees up into a single averaged score for a
// period. Used when a department has employees; if it has none, callers
// fall back to scoreDepartment (the template's own numbers).
export function rollupEmployees(
  employees: Employee[],
  period: Period
): ScoreResult {
  if (employees.length === 0) return { raw: 0, weighted: 0, status: "red" };
  const avg =
    employees.reduce((s, e) => s + scoreEmployee(e, period).raw, 0) /
    employees.length;
  return { raw: avg, weighted: avg, status: statusFor(avg) };
}
