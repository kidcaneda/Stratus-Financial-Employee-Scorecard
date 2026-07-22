"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useDepartments } from "@/hooks/useDepartments";
import { useEmployees } from "@/hooks/useEmployees";
import { useMonthlyEvaluations } from "@/hooks/useMonthlyEvaluations";
import { scoreEmployee, scoreMetric, fmt } from "@/lib/scoring";
import { analyze } from "@/lib/analytics";
import { Period } from "@/types";
import { PeriodSelector, StatusPill, ScoreRing, MockBanner } from "@/components/ui";
import { MonthlyTrend } from "@/components/MonthlyTrend";
import { AnalyticsPanel } from "@/components/AnalyticsPanel";
import { GrowDisplay, hasGrow } from "@/components/GrowNotes";

export default function EmployeeDetailPage() {
  const { id, empId } = useParams<{ id: string; empId: string }>();
  const { departments } = useDepartments();
  const { employees, isMock, loading } = useEmployees(id);
  const { months } = useMonthlyEvaluations(id, empId);
  const [period, setPeriod] = useState<Period>("monthly");

  if (loading) return <div className="text-sm text-ink-muted">Loading…</div>;

  const dept = departments.find((d) => d.id === id);
  const emp = employees.find((e) => e.id === empId);

  if (!emp) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-ink-muted">Employee not found.</p>
        <Link href={`/departments/${id}`} className="btn-ghost">
          ← Back to department
        </Link>
      </div>
    );
  }

  const overall = scoreEmployee(emp, period);

  // Evaluator commentary history: every month that carries GROW notes,
  // newest first (KPI), plus the competency review's notes if any.
  const growMonths = [...months]
    .filter((m) => hasGrow(m.grow))
    .sort((a, b) => b.monthKey.localeCompare(a.monthKey));
  const competencyGrow =
    emp.competency && hasGrow(emp.competency.grow) ? emp.competency.grow : undefined;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link
            href={`/departments/${id}`}
            className="text-sm text-ink-muted hover:text-ink"
          >
            ← {dept?.name ?? "Department"}
          </Link>
          <h1 className="mt-1 text-2xl font-semibold text-ink">{emp.name}</h1>
          <p className="text-sm text-ink-muted">
            {emp.role} · Evaluator: {emp.evaluatorName}
          </p>
        </div>
        <PeriodSelector value={period} onChange={setPeriod} />
      </div>

      {isMock && <MockBanner />}

      {/* Phase C: dated monthly time-series — trend + quarter/year rollups */}
      <MonthlyTrend months={months} year={new Date().getFullYear()} />

      {/* Phase E: rule-based analytics derived from the time-series */}
      <AnalyticsPanel report={analyze(months)} />

      {/* Evaluator's GROW commentary — full history, newest first. */}
      {growMonths.map((m) => (
        <GrowDisplay
          key={m.monthKey}
          grow={m.grow!}
          title={`Evaluator comments · ${m.monthKey}`}
          subtitle={`Recorded with the ${m.monthKey} evaluation${
            m.recordedByName ? ` by ${m.recordedByName}` : ""
          }`}
        />
      ))}
      {growMonths.length === 0 && competencyGrow && (
        <GrowDisplay grow={competencyGrow} subtitle="From the latest competency review" />
      )}

      {/* Overall */}
      <div className="card flex items-center gap-6 p-6">
        <ScoreRing value={overall.raw} status={overall.status} />
        <div className="space-y-2">
          <StatusPill status={overall.status} />
          <p className="max-w-md text-sm text-ink-muted">
            Individual weighted score across {emp.metrics.length} metrics for the{" "}
            <span className="capitalize">{period}</span> period.
          </p>
        </div>
      </div>

      {/* Metrics */}
      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-hairline bg-panel-2 text-left text-xs uppercase tracking-wide text-ink-muted">
              <th className="px-4 py-3 font-medium">Metric</th>
              <th className="px-4 py-3 text-right font-medium">Actual</th>
              <th className="px-4 py-3 text-right font-medium">Weight</th>
              <th className="px-4 py-3 text-right font-medium">Score</th>
              <th className="px-4 py-3 text-right font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-hairline">
            {emp.metrics.map((m) => {
              const res = scoreMetric(m, period);
              return (
                <tr key={m.id} className="hover:bg-panel-2">
                  <td className="px-4 py-3 font-medium text-ink">{m.name}</td>
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
    </div>
  );
}
