"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip,
  ReferenceLine,
} from "recharts";
import { MonthlyEvaluation, Quarter } from "@/types";
import {
  yearTrend,
  quarterlyScore,
  yearlyScore,
  MONTH_NAMES,
} from "@/lib/rollup";
import { statusClasses, fmt } from "@/lib/scoring";

// Shows an employee's 12-month score trend plus computed quarter/year
// rollups. All derived from the dated monthly time-series (Phase C).
export function MonthlyTrend({
  months,
  year,
}: {
  months: MonthlyEvaluation[];
  year: number;
}) {
  const trend = yearTrend(months, year).map((t) => ({
    name: MONTH_NAMES[t.month - 1],
    score: t.score,
  }));

  const quarters: Quarter[] = [1, 2, 3, 4];
  const yearRes = yearlyScore(months, year);

  const recordedCount = months.filter((m) => m.monthKey.startsWith(String(year)))
    .length;

  return (
    <div className="space-y-4">
      {/* Year + quarter rollup cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <RollupCard label={`${year} (Year)`} value={yearRes.raw} status={yearRes.status} highlight />
        {quarters.map((q) => {
          const r = quarterlyScore(months, year, q);
          return (
            <RollupCard
              key={q}
              label={`Q${q}`}
              value={r.raw}
              status={r.status}
              empty={r.raw === 0}
            />
          );
        })}
      </div>

      {/* 12-month trend line */}
      <div className="card p-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-ink">
            Monthly trend · {year}
          </h3>
          <span className="text-xs text-ink-muted">
            {recordedCount} of 12 months recorded
          </span>
        </div>
        {recordedCount === 0 ? (
          <p className="py-8 text-center text-sm text-ink-muted">
            No monthly evaluations recorded for {year} yet.
          </p>
        ) : (
          <div style={{ width: "100%", height: 240 }}>
            <ResponsiveContainer>
              <LineChart data={trend} margin={{ left: -16, right: 8, top: 8 }}>
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#5A6B7B" }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: "#5A6B7B" }} />
                <ReferenceLine y={90} stroke="#1F9D6E" strokeDasharray="3 3" />
                <ReferenceLine y={70} stroke="#D99315" strokeDasharray="3 3" />
                <Tooltip
                  formatter={(v: any) => (v == null ? ["—", "Score"] : [fmt(v, 1), "Score"])}
                  contentStyle={{ borderRadius: 10, border: "1px solid #e2e8f0", fontSize: 12 }}
                />
                <Line
                  type="monotone"
                  dataKey="score"
                  stroke="#2E6BE6"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  connectNulls
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}

function RollupCard({
  label,
  value,
  status,
  highlight,
  empty,
}: {
  label: string;
  value: number;
  status: import("@/types").Status;
  highlight?: boolean;
  empty?: boolean;
}) {
  const c = statusClasses(status);
  return (
    <div className={`card p-3 ${highlight ? "ring-1 ring-ink/10" : ""}`}>
      <div className="text-xs uppercase tracking-wide text-ink-muted">{label}</div>
      {empty ? (
        <div className="mt-1 text-2xl font-semibold text-slate-300">—</div>
      ) : (
        <div className={`mt-1 text-2xl font-semibold tabular-nums ${c.text}`}>
          {fmt(value, 0)}
        </div>
      )}
    </div>
  );
}
