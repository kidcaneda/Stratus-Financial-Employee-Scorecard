"use client";

import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useDepartments } from "@/hooks/useDepartments";
import { scoreDepartment, scoreMetric, fmt } from "@/lib/scoring";
import { Period } from "@/types";
import { PeriodSelector, StatusPill, ScoreRing, MockBanner } from "@/components/ui";

export default function MyScorecardPage() {
  const { user } = useAuth();
  const { departments, isMock, loading } = useDepartments();
  const [period, setPeriod] = useState<Period>("monthly");

  if (loading) return <div className="text-sm text-ink-muted">Loading…</div>;

  // Employee sees their assigned department; admins/managers without a
  // department assignment see the first as an example.
  const dept =
    departments.find((d) => d.id === user?.departmentId) ?? departments[0];

  if (!dept) {
    return <p className="text-sm text-ink-muted">No scorecard assigned yet.</p>;
  }

  const overall = scoreDepartment(dept, period);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-ink">My Scorecard</h1>
          <p className="text-sm text-ink-muted">
            {user?.displayName} · {dept.name}
          </p>
        </div>
        <PeriodSelector value={period} onChange={setPeriod} />
      </div>

      {isMock && <MockBanner />}

      <div className="card flex flex-col items-center gap-4 p-6 sm:flex-row sm:gap-8">
        <ScoreRing value={overall.raw} status={overall.status} size={140} />
        <div className="flex-1 space-y-3">
          <StatusPill status={overall.status} />
          <div className="grid grid-cols-3 gap-3">
            {(["monthly", "quarterly", "yearly"] as Period[]).map((p) => {
              const r = scoreDepartment(dept, p);
              return (
                <div key={p} className="rounded-lg bg-paper p-3 text-center">
                  <div className="text-xs uppercase tracking-wide text-ink-muted">
                    {p}
                  </div>
                  <div className="text-xl font-semibold tabular-nums text-ink">
                    {fmt(r.raw, 0)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-paper text-left text-xs uppercase tracking-wide text-ink-muted">
              <th className="px-4 py-3 font-medium">Metric</th>
              <th className="px-4 py-3 text-right font-medium">Target</th>
              <th className="px-4 py-3 text-right font-medium">Actual</th>
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
    </div>
  );
}
