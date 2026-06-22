"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useDepartments } from "@/hooks/useDepartments";
import { scoreDepartment, scoreMetric, fmt } from "@/lib/scoring";
import { Period } from "@/types";
import { PeriodSelector, StatusPill, ScoreRing, MockBanner } from "@/components/ui";

export default function DepartmentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { departments, isMock, loading } = useDepartments();
  const [period, setPeriod] = useState<Period>("monthly");

  if (loading) return <div className="text-sm text-ink-muted">Loading…</div>;

  const dept = departments.find((d) => d.id === id);
  if (!dept) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-ink-muted">Department not found.</p>
        <Link href="/departments" className="btn-ghost">← Back to departments</Link>
      </div>
    );
  }

  const overall = scoreDepartment(dept, period);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/departments" className="text-sm text-ink-muted hover:text-ink">
            ← Departments
          </Link>
          <h1 className="mt-1 text-2xl font-semibold text-ink">{dept.name}</h1>
          <p className="text-sm text-ink-muted">{dept.managerName}</p>
        </div>
        <PeriodSelector value={period} onChange={setPeriod} />
      </div>

      {isMock && <MockBanner />}

      {/* Overall summary */}
      <div className="card flex items-center gap-6 p-6">
        <ScoreRing value={overall.raw} status={overall.status} />
        <div className="space-y-2">
          <StatusPill status={overall.status} />
          <p className="max-w-md text-sm text-ink-muted">
            Weighted score across {dept.metrics.length} metrics for the{" "}
            <span className="capitalize">{period}</span> period.
          </p>
        </div>
      </div>

      {/* Metrics table */}
      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-paper text-left text-xs uppercase tracking-wide text-ink-muted">
              <th className="px-4 py-3 font-medium">Metric</th>
              <th className="px-4 py-3 text-right font-medium">Target</th>
              <th className="px-4 py-3 text-right font-medium">Actual</th>
              <th className="px-4 py-3 text-right font-medium">Weight</th>
              <th className="px-4 py-3 text-right font-medium">Score</th>
              <th className="px-4 py-3 text-right font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {dept.metrics.map((m) => {
              const res = scoreMetric(m, period);
              return (
                <tr key={m.id} className="hover:bg-paper">
                  <td className="px-4 py-3 font-medium text-ink">{m.name}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-ink-muted">
                    {fmt(m.target, 1)} {m.unit}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-ink">
                    {fmt(m.actual[period], 1)} {m.unit}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-ink-muted">
                    {fmt(m.weight * 100, 0)}%
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-ink">
                    {fmt(res.raw, 0)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <StatusPill status={res.status} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Comments + signatures (mirrors a physical scorecard) */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="card p-5">
          <h3 className="mb-2 text-sm font-semibold text-ink">Manager comments</h3>
          <textarea
            className="h-24 w-full resize-none rounded-lg border border-slate-200 p-3 text-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
            placeholder="Add notes for this review period…"
          />
        </div>
        <div className="card flex flex-col justify-between p-5">
          <h3 className="mb-2 text-sm font-semibold text-ink">Sign-off</h3>
          <div className="space-y-4">
            <SignLine label="Reviewed by" />
            <SignLine label="Acknowledged by" />
          </div>
        </div>
      </div>
    </div>
  );
}

function SignLine({ label }: { label: string }) {
  return (
    <div>
      <div className="h-8 border-b border-slate-300" />
      <div className="mt-1 text-xs text-ink-muted">{label}</div>
    </div>
  );
}
