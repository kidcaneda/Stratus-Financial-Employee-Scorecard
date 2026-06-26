import {
  MonthlyEvaluation,
  MonthKey,
  Quarter,
  QUARTER_MONTHS,
  ScoreResult,
  Status,
} from "@/types";
import { statusFor } from "@/lib/scoring";

// ============================================================
// Phase C rollup: derive quarterly and yearly scores from the
// dated monthly time-series. Rollup method = AVERAGE (per the
// chosen design): a period's score is the mean of the weighted
// monthly scores within it.
// ============================================================

// Parse "2026-01" → { year: 2026, month: 1 }.
export function parseMonthKey(key: MonthKey): { year: number; month: number } {
  const [y, m] = key.split("-").map(Number);
  return { year: y, month: m };
}

export function makeMonthKey(year: number, month: number): MonthKey {
  return `${year}-${String(month).padStart(2, "0")}`;
}

// Weighted 0–100 score for a single monthly evaluation.
export function scoreMonth(evaln: MonthlyEvaluation): number {
  const totalWeight = evaln.entries.reduce((s, e) => s + e.weight, 0) || 1;
  const weighted = evaln.entries.reduce((s, e) => s + e.score * e.weight, 0);
  return weighted / totalWeight;
}

// Average the weighted monthly scores across a set of months.
function averageOf(months: MonthlyEvaluation[]): ScoreResult {
  if (months.length === 0) return { raw: 0, weighted: 0, status: "red" as Status };
  const avg = months.reduce((s, m) => s + scoreMonth(m), 0) / months.length;
  return { raw: avg, weighted: avg, status: statusFor(avg) };
}

// All months belonging to a given year.
export function monthsInYear(
  all: MonthlyEvaluation[],
  year: number
): MonthlyEvaluation[] {
  return all.filter((m) => parseMonthKey(m.monthKey).year === year);
}

// Months belonging to a given quarter of a year.
export function monthsInQuarter(
  all: MonthlyEvaluation[],
  year: number,
  quarter: Quarter
): MonthlyEvaluation[] {
  const set = new Set(QUARTER_MONTHS[quarter]);
  return all.filter((m) => {
    const p = parseMonthKey(m.monthKey);
    return p.year === year && set.has(p.month);
  });
}

// Score for one specific month (or zero if not recorded).
export function monthlyScore(
  all: MonthlyEvaluation[],
  monthKey: MonthKey
): ScoreResult {
  const m = all.find((x) => x.monthKey === monthKey);
  if (!m) return { raw: 0, weighted: 0, status: "red" };
  const raw = scoreMonth(m);
  return { raw, weighted: raw, status: statusFor(raw) };
}

// Quarter rollup = average of that quarter's recorded months.
export function quarterlyScore(
  all: MonthlyEvaluation[],
  year: number,
  quarter: Quarter
): ScoreResult {
  return averageOf(monthsInQuarter(all, year, quarter));
}

// Year rollup = average of that year's recorded months.
export function yearlyScore(
  all: MonthlyEvaluation[],
  year: number
): ScoreResult {
  return averageOf(monthsInYear(all, year));
}

// Which quarter a month number falls in.
export function quarterOf(month: number): Quarter {
  return (Math.floor((month - 1) / 3) + 1) as Quarter;
}

// Build a 12-month trend series for a year (for charts/analytics later).
export function yearTrend(
  all: MonthlyEvaluation[],
  year: number
): { monthKey: MonthKey; month: number; score: number | null }[] {
  return Array.from({ length: 12 }, (_, i) => {
    const month = i + 1;
    const key = makeMonthKey(year, month);
    const m = all.find((x) => x.monthKey === key);
    return { monthKey: key, month, score: m ? scoreMonth(m) : null };
  });
}

// Month names for display.
export const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];
