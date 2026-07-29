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
import { GrowDisplay, GrowHistory, hasGrow } from "@/components/GrowNotes";

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

  // The employee's own responses (accepted / challenged), newest first.
  const responses = [...months]
    .filter((m) => m.ackStatus && m.ackStatus !== "pending")
    .sort((a, b) => b.monthKey.localeCompare(a.monthKey));
  const challenges = responses.filter((m) => m.ackStatus === "disputed").length;
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

      {/* What the employee said back: accepted / challenged + comment. */}
      {responses.length > 0 && (
        <div className="card p-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-ink">Employee responses</h3>
            {challenges > 0 && (
              <span className="pill bg-signal-amberbg text-signal-amber">
                {challenges} challenged
              </span>
            )}
          </div>
          <div className="space-y-2">
            {responses.map((m) => (
              <div
                key={m.monthKey}
                className="flex flex-wrap items-start gap-3 rounded-lg bg-panel-2 p-3"
              >
                <span className="text-sm font-medium tabular-nums text-ink">
                  {m.monthKey}
                </span>
                <span
                  className={`pill ${
                    m.ackStatus === "acknowledged"
                      ? "bg-signal-greenbg text-signal-green"
                      : "bg-signal-amberbg text-signal-amber"
                  }`}
                >
                  {m.ackStatus === "acknowledged" ? "Accepted" : "Challenged"}
                </span>
                {m.employeeComment && (
                  <p className="min-w-[12rem] flex-1 whitespace-pre-wrap text-sm text-ink-muted">
                    “{m.employeeComment}”
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Evaluator's GROW commentary — pick a month, quarter, or all. */}
      {growMonths.length > 0 && <GrowHistory growMonths={growMonths} />}
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
