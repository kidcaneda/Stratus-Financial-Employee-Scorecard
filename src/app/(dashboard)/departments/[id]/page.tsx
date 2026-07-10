"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useDepartments } from "@/hooks/useDepartments";
import { useEmployees } from "@/hooks/useEmployees";
import { useDepartmentMonths } from "@/hooks/useDepartmentMonths";
import { useAuth } from "@/hooks/useAuth";
import { scoreDepartment, scoreMetric, scoreEmployee, fmt } from "@/lib/scoring";
import { analyze } from "@/lib/analytics";
import { Period, Employee, isDeptLead } from "@/types";
import { PeriodSelector, StatusPill, ScoreRing, MockBanner } from "@/components/ui";
import { CompetencyView } from "@/components/CompetencyView";
import { EvaluationForm } from "@/components/EvaluationForm";
import { MetricsEditor } from "@/components/MetricsEditor";
import { CriteriaEditor } from "@/components/CriteriaEditor";
import { AnalyticsPanel } from "@/components/AnalyticsPanel";

export default function DepartmentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { departments, isMock, loading } = useDepartments();
  const { employees } = useEmployees(id);
  const { months: deptMonths } = useDepartmentMonths(id);
  const { user } = useAuth();
  const [period, setPeriod] = useState<Period>("monthly");
  // Score-entry state: `open` false = closed; when open, `target` is the
  // employee being scored, or null for a brand-new one.
  const [form, setForm] = useState<{ open: boolean; target: Employee | null }>({
    open: false,
    target: null,
  });
  const [editingMetrics, setEditingMetrics] = useState(false);

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

  const isCompetency = dept.type === "competency";
  const overall = isCompetency ? null : scoreDepartment(dept, period);

  // Supervisors (managers) and admins can score employees. (The server
  // re-checks the specific department permission; this just controls UI.)
  const isAdmin = user?.role === "admin";
  const canEdit = isAdmin || isDeptLead(user?.role);
  const scoreVerb = isCompetency ? "Review" : "Score";

  const openNew = () => setForm({ open: true, target: null });
  const openEdit = (e: Employee) => setForm({ open: true, target: e });
  const closeForm = () => setForm({ open: false, target: null });
  const onSaved = () => {
    closeForm();
    window.location.reload();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/departments" className="text-sm text-ink-muted hover:text-ink">
            ← Departments
          </Link>
          <h1 className="mt-1 text-2xl font-semibold text-ink">{dept.name}</h1>
          <p className="text-sm text-ink-muted">
            {dept.evaluatorName
              ? `Evaluator: ${dept.evaluatorName}`
              : dept.managerName}
          </p>
        </div>
        {/* Period selector only applies to multi-period KPI scorecards. */}
        {!isCompetency && <PeriodSelector value={period} onChange={setPeriod} />}
      </div>

      {isMock && <MockBanner />}

      {/* Score-entry form (supervisors & admins) — adapts to KPI or competency. */}
      {canEdit && form.open && (
        <EvaluationForm
          key={form.target?.id ?? "new"}
          dept={dept}
          existing={form.target ?? undefined}
          onSaved={onSaved}
          onCancel={closeForm}
        />
      )}

      {canEdit && !form.open && (
        <div className="flex items-center justify-between gap-3 rounded-card border border-hairline bg-panel-2/50 px-4 py-3">
          <div className="flex items-center gap-2 text-sm text-ink-soft">
            <span className="grid h-6 w-6 place-items-center rounded-full bg-accent/15 text-accent">
              ✎
            </span>
            <span>
              You have <span className="font-medium text-ink">score-entry access</span> for
              this department.
            </span>
          </div>
          <div className="flex items-center gap-2">
            {isAdmin && !editingMetrics && (
              <button onClick={() => setEditingMetrics(true)} className="btn-ghost">
                {isCompetency ? "Edit criteria" : "Edit metrics"}
              </button>
            )}
            <button onClick={openNew} className="btn-primary">
              + {scoreVerb} employee
            </button>
          </div>
        </div>
      )}

      {/* Admin template editors: metrics (KPI) / criteria (competency). */}
      {isAdmin &&
        editingMetrics &&
        (isCompetency ? (
          <CriteriaEditor
            dept={dept}
            onSaved={() => window.location.reload()}
            onCancel={() => setEditingMetrics(false)}
          />
        ) : (
          <MetricsEditor
            dept={dept}
            onSaved={() => window.location.reload()}
            onCancel={() => setEditingMetrics(false)}
          />
        ))}

      {/* Employee roster (Phase A). Shown when the department has people. */}
      {employees.length > 0 && (
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between border-b border-hairline bg-panel-2 px-4 py-2.5">
            <h3 className="text-sm font-semibold text-ink">
              Employees ({employees.length})
            </h3>
            <span className="text-xs text-ink-muted">Individual scorecards</span>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-hairline text-left text-xs uppercase tracking-wide text-ink-muted">
                <th className="px-4 py-2 font-medium">Name</th>
                <th className="px-4 py-2 font-medium">Role</th>
                <th className="px-4 py-2 text-right font-medium">Score</th>
                <th className="px-4 py-2 text-right font-medium">Status</th>
                <th className="px-4 py-2 text-right font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {employees
                .map((e) => ({ e, res: scoreEmployee(e, period) }))
                .sort((a, b) => b.res.raw - a.res.raw)
                .map(({ e, res }) => (
                  <tr key={e.id} className="group transition-colors hover:bg-panel-2">
                    <td className="px-4 py-3 font-medium text-ink">{e.name}</td>
                    <td className="px-4 py-3 text-ink-muted">{e.role}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-ink">
                      {fmt(res.raw, 1)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <StatusPill status={res.status} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-2">
                        {canEdit && (
                          <button
                            onClick={() => openEdit(e)}
                            className="rounded-lg border border-transparent px-3 py-1.5 text-sm font-medium text-accent transition-all hover:border-accent/40 hover:bg-accent/10 active:scale-[0.98]"
                          >
                            {scoreVerb}
                          </button>
                        )}
                        <Link
                          href={`/departments/${dept.id}/employees/${e.id}`}
                          className="btn-ghost"
                        >
                          View
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}

      {isCompetency ? (
        <CompetencyView dept={dept} />
      ) : (
        <KpiView dept={dept} period={period} overall={overall!} />
      )}

      {/* Phase E: department-level analytics from pooled employee months. */}
      {!isCompetency && deptMonths.length > 0 && (
        <AnalyticsPanel report={analyze(deptMonths)} />
      )}

      {/* Comments + signatures (mirrors a physical scorecard) */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="card p-5">
          <h3 className="mb-2 text-sm font-semibold text-ink">Manager comments</h3>
          <textarea
            className="h-24 w-full resize-none rounded-lg border border-hairline p-3 text-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
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

// The standard 0–100 KPI scorecard view (extracted so the page can switch
// between this and the competency view based on dept.type).
function KpiView({
  dept,
  period,
  overall,
}: {
  dept: import("@/types").Department;
  period: Period;
  overall: import("@/types").ScoreResult;
}) {
  return (
    <>
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
            <tr className="border-b border-hairline bg-panel-2 text-left text-xs uppercase tracking-wide text-ink-muted">
              <th className="px-4 py-3 font-medium">Metric</th>
              <th className="px-4 py-3 text-right font-medium">Target</th>
              <th className="px-4 py-3 text-right font-medium">Actual</th>
              <th className="px-4 py-3 text-right font-medium">Weight</th>
              <th className="px-4 py-3 text-right font-medium">Score</th>
              <th className="px-4 py-3 text-right font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-hairline">
            {dept.metrics.map((m) => {
              const res = scoreMetric(m, period);
              return (
                <tr key={m.id} className="hover:bg-panel-2">
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
    </>
  );
}

function SignLine({ label }: { label: string }) {
  return (
    <div>
      <div className="h-8 border-b border-hairline" />
      <div className="mt-1 text-xs text-ink-muted">{label}</div>
    </div>
  );
}
