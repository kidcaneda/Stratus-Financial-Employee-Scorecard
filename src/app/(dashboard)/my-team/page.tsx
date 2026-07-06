"use client";

import { useState } from "react";
import Link from "next/link";
import { useAuth } from "@/hooks/useAuth";
import { useMyTeam } from "@/hooks/useMyTeam";
import { scoreEmployee, fmt } from "@/lib/scoring";
import { Employee, Period, isDeptLead } from "@/types";
import { PeriodSelector, StatusPill, MockBanner } from "@/components/ui";
import { EvaluationForm } from "@/components/EvaluationForm";

// ============================================================
// My Team — the one place a supervisor/manager scores the people who
// report to them, across every department they cover. The roster comes
// from useMyTeam (direct evaluator links + assigned departments), so
// leads never page through departments that aren't theirs.
// ============================================================

export default function MyTeamPage() {
  const { user } = useAuth();
  const { groups, isMock, loading, refresh } = useMyTeam();
  const [period, setPeriod] = useState<Period>("monthly");
  // Which report is being scored: a department plus an employee (or null
  // for a brand-new hire in that department).
  const [editing, setEditing] = useState<{
    deptId: string;
    target: Employee | null;
  } | null>(null);

  if (loading) return <div className="text-sm text-ink-muted">Loading…</div>;

  const isAdmin = user?.role === "admin";
  const canScore = isAdmin || isDeptLead(user?.role);
  const total = groups.reduce((s, g) => s + g.employees.length, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-ink">My Team</h1>
          <p className="text-sm text-ink-muted">
            {isAdmin
              ? `Admin — you can evaluate ${total > 0 ? `all ${total} employees across ${groups.length} departments` : "every employee"}`
              : total > 0
              ? `${total} ${total === 1 ? "person reports" : "people report"} to you across ${groups.length} ${groups.length === 1 ? "department" : "departments"}`
              : "Employees who report to you"}
          </p>
        </div>
        <PeriodSelector value={period} onChange={setPeriod} />
      </div>

      {isMock && <MockBanner />}

      {groups.length === 0 && (
        <div className="card p-8 text-center">
          <h2 className="text-base font-semibold text-ink">
            {isAdmin ? "No employees yet" : "No reports yet"}
          </h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-ink-muted">
            {isAdmin ? (
              <>
                No employee records exist yet. Add them from a{" "}
                <Link href="/departments" className="text-accent hover:underline">
                  department page
                </Link>{" "}
                or run the directory import script.
              </>
            ) : (
              <>
                Employees appear here when you record their scorecard (you
                become their evaluator automatically) or when an admin assigns
                you their department. Browse{" "}
                <Link href="/departments" className="text-accent hover:underline">
                  Departments
                </Link>{" "}
                to get started.
              </>
            )}
          </p>
        </div>
      )}

      {groups.map(({ dept, employees }) => {
        const isCompetency = dept.type === "competency";
        const verb = isCompetency ? "Review" : "Score";
        const open = editing?.deptId === dept.id;

        return (
          <section key={dept.id} className="space-y-3">
            {canScore && open && (
              <EvaluationForm
                key={editing?.target?.id ?? "new"}
                dept={dept}
                existing={editing?.target ?? undefined}
                onSaved={() => {
                  setEditing(null);
                  refresh();
                }}
                onCancel={() => setEditing(null)}
              />
            )}

            <div className="card overflow-hidden">
              <div className="flex items-center justify-between border-b border-hairline bg-panel-2 px-4 py-2.5">
                <div className="flex items-baseline gap-2">
                  <Link
                    href={`/departments/${dept.id}`}
                    className="text-sm font-semibold text-ink hover:text-accent"
                  >
                    {dept.name}
                  </Link>
                  <span className="text-xs text-ink-muted">
                    {employees.length} {employees.length === 1 ? "report" : "reports"}
                    {isCompetency ? " · competency review" : " · KPI scorecard"}
                  </span>
                </div>
                {canScore && !open && (
                  <button
                    onClick={() => setEditing({ deptId: dept.id, target: null })}
                    className="btn-ghost text-accent"
                  >
                    + {verb} employee
                  </button>
                )}
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
                      <tr key={e.id} className="transition-colors hover:bg-panel-2">
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
                            {canScore && (
                              <button
                                onClick={() =>
                                  setEditing({ deptId: dept.id, target: e })
                                }
                                className="rounded-lg border border-transparent px-3 py-1.5 text-sm font-medium text-accent transition-all hover:border-accent/40 hover:bg-accent/10 active:scale-[0.98]"
                              >
                                {verb}
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
          </section>
        );
      })}
    </div>
  );
}
