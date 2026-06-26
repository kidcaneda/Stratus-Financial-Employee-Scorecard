import { MonthlyEvaluation, MonthlyMetricEntry } from "@/types";
import { scoreMonth, MONTH_NAMES, parseMonthKey } from "@/lib/rollup";

// ============================================================
// Rule-based analytics. NO external AI — every insight is derived
// deterministically from the internal time-series, so each one is
// explainable and traceable to specific numbers. Output is framed as
// draft observations for a human (manager) to review, not verdicts.
// ============================================================

export interface Insight {
  text: string;
  evidence: string; // the specific data behind it
}

export interface AnalyticsReport {
  strengths: Insight[];
  opportunities: Insight[];
  actions: Insight[];
  summary: string;
  monthsAnalyzed: number;
}

const GREEN = 90;
const AMBER = 70;

// Per-metric stats across the recorded months.
interface MetricStat {
  metricId: string;
  name: string;
  unit: string;
  avg: number;
  first: number;
  last: number;
  trend: number; // last - first
  min: number;
  max: number;
  count: number;
}

function computeMetricStats(months: MonthlyEvaluation[]): MetricStat[] {
  // Group scores by metric across months (oldest→newest).
  const sorted = [...months].sort((a, b) => a.monthKey.localeCompare(b.monthKey));
  const byMetric = new Map<string, { name: string; unit: string; scores: number[] }>();

  for (const m of sorted) {
    for (const e of m.entries) {
      if (!byMetric.has(e.metricId)) {
        byMetric.set(e.metricId, { name: e.metricName, unit: e.unit, scores: [] });
      }
      byMetric.get(e.metricId)!.scores.push(e.score);
    }
  }

  const stats: MetricStat[] = [];
  for (const [metricId, { name, unit, scores }] of byMetric) {
    if (scores.length === 0) continue;
    const avg = scores.reduce((s, v) => s + v, 0) / scores.length;
    stats.push({
      metricId,
      name,
      unit,
      avg,
      first: scores[0],
      last: scores[scores.length - 1],
      trend: scores[scores.length - 1] - scores[0],
      min: Math.min(...scores),
      max: Math.max(...scores),
      count: scores.length,
    });
  }
  return stats;
}

// Build the analytics report for a single subject (employee or a
// department treated as one stream of monthly evaluations).
export function analyze(months: MonthlyEvaluation[]): AnalyticsReport {
  const stats = computeMetricStats(months);
  const strengths: Insight[] = [];
  const opportunities: Insight[] = [];
  const actions: Insight[] = [];

  if (months.length === 0 || stats.length === 0) {
    return {
      strengths: [],
      opportunities: [],
      actions: [],
      summary: "Not enough recorded data to analyze yet. Record at least one month to begin.",
      monthsAnalyzed: 0,
    };
  }

  for (const s of stats) {
    // STRENGTH: consistently high average.
    if (s.avg >= GREEN) {
      strengths.push({
        text: `Strong, consistent performance in ${s.name}.`,
        evidence: `Averaged ${s.avg.toFixed(0)} across ${s.count} month(s).`,
      });
    }
    // STRENGTH: meaningful improvement over time.
    if (s.trend >= 10) {
      strengths.push({
        text: `Clear upward trend in ${s.name}.`,
        evidence: `Improved from ${s.first.toFixed(0)} to ${s.last.toFixed(0)} (+${s.trend.toFixed(0)}).`,
      });
    }

    // OPPORTUNITY: consistently low average.
    if (s.avg < AMBER) {
      opportunities.push({
        text: `${s.name} is below target and needs attention.`,
        evidence: `Averaged ${s.avg.toFixed(0)}, under the ${AMBER} threshold.`,
      });
      actions.push({
        text: `Set a specific improvement goal for ${s.name} next period and review progress monthly.`,
        evidence: `Current average ${s.avg.toFixed(0)}; target at least ${AMBER}.`,
      });
    } else if (s.avg < GREEN) {
      // Middle band — opportunity to push to green.
      opportunities.push({
        text: `${s.name} is solid but has room to reach the top band.`,
        evidence: `Averaged ${s.avg.toFixed(0)}; ${(GREEN - s.avg).toFixed(0)} points from green.`,
      });
    }

    // OPPORTUNITY: declining trend even if average is okay.
    if (s.trend <= -10) {
      opportunities.push({
        text: `${s.name} is trending downward and should be watched.`,
        evidence: `Dropped from ${s.first.toFixed(0)} to ${s.last.toFixed(0)} (${s.trend.toFixed(0)}).`,
      });
      actions.push({
        text: `Investigate what changed for ${s.name} and address it before it affects the overall score.`,
        evidence: `Recent decline of ${Math.abs(s.trend).toFixed(0)} points.`,
      });
    }

    // OPPORTUNITY: high volatility.
    const spread = s.max - s.min;
    if (spread >= 30 && s.count >= 3) {
      opportunities.push({
        text: `${s.name} is inconsistent month to month.`,
        evidence: `Ranged from ${s.min.toFixed(0)} to ${s.max.toFixed(0)} (spread ${spread.toFixed(0)}).`,
      });
    }
  }

  // Overall summary line.
  const overallAvg =
    months.reduce((s, m) => s + scoreMonth(m), 0) / months.length;
  const band = overallAvg >= GREEN ? "strong" : overallAvg >= AMBER ? "solid" : "below target";
  const summary = `Across ${months.length} recorded month(s), overall performance is ${band} (avg ${overallAvg.toFixed(0)}). ${strengths.length} strength signal(s) and ${opportunities.length} opportunity area(s) identified.`;

  // De-duplicate actions, cap to the most relevant few.
  const seen = new Set<string>();
  const dedupedActions = actions.filter((a) => {
    if (seen.has(a.text)) return false;
    seen.add(a.text);
    return true;
  });

  return {
    strengths,
    opportunities,
    actions: dedupedActions,
    summary,
    monthsAnalyzed: months.length,
  };
}

// Department analysis: pool all employees' months into one stream.
export function analyzeDepartment(
  allEmployeeMonths: MonthlyEvaluation[][]
): AnalyticsReport {
  const pooled = allEmployeeMonths.flat();
  return analyze(pooled);
}
