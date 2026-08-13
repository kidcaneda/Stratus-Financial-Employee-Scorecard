"use client";

import { useMemo, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useAllEmployees } from "@/hooks/useAllEmployees";
import { useAllMonths } from "@/hooks/useAllMonths";
import { useMyScope } from "@/hooks/useMyScope";
import { buildReport, STATUS_LABEL, score1 } from "@/lib/report-data";
import { exportExcel, exportPowerPoint, exportWord } from "@/lib/report-export";
import { Period, isDeptLead } from "@/types";
import { PeriodSelector, StatusPill } from "@/components/ui";

// ============================================================
// Reports — an executive-ready summary of individual and department
// scores, exportable to Excel, PowerPoint, Word or PDF.
//
// What's on screen IS the PDF: the print stylesheet hides the app
// chrome so "Export PDF" simply opens the browser's print dialog on
// this same layout. All four formats render from one report model, so
// the deck and the workbook can never disagree.
// ============================================================

export default function ReportsPage() {
  const { user } = useAuth();
  const { employees, departments, loading } = useAllEmployees();
  const { months, loading: monthsLoading } = useAllMonths();
  const { departmentIds, loading: scopeLoading } = useMyScope();
  const [period, setPeriod] = useState<Period>("monthly");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  const canView = user?.role === "admin" || isDeptLead(user?.role);

  // Leads report on their own departments; admins on everything.
  const scoped = useMemo(() => {
    if (!departmentIds) return { departments, employees };
    const allow = new Set(departmentIds);
    return {
      departments: departments.filter((d) => allow.has(d.id)),
      employees: employees.filter((e) => allow.has(e.departmentId)),
    };
  }, [departments, employees, departmentIds]);

  const report = useMemo(
    () =>
      buildReport({
        departments: scoped.departments,
        employees: scoped.employees,
        months,
        period,
        scopeLabel:
          departmentIds === null
            ? "All departments"
            : `${scoped.departments.length} department${
                scoped.departments.length === 1 ? "" : "s"
              }`,
      }),
    [scoped, months, period, departmentIds]
  );

  if (!canView && user) {
    return (
      <div className="card p-6">
        <h1 className="text-lg font-semibold text-ink">Restricted</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Reports are available to leaders and administrators.
        </p>
      </div>
    );
  }

  if (loading || monthsLoading || scopeLoading)
    return <div className="text-sm text-ink-muted">Loading…</div>;

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    setError("");
    try {
      await fn();
    } catch (e: any) {
      setError(e?.message || `Couldn't build the ${label} file.`);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Controls — hidden when printing */}
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Reports</h1>
          <p className="text-sm text-ink-muted">
            Executive summary of individual and department scores ·{" "}
            {report.scopeLabel}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <PeriodSelector value={period} onChange={setPeriod} />
          <button
            onClick={() => run("Excel", () => exportExcel(report))}
            disabled={!!busy}
            className="btn-ghost"
          >
            {busy === "Excel" ? "Building…" : "Excel"}
          </button>
          <button
            onClick={() => run("PowerPoint", () => exportPowerPoint(report))}
            disabled={!!busy}
            className="btn-ghost"
          >
            {busy === "PowerPoint" ? "Building…" : "PowerPoint"}
          </button>
          <button
            onClick={() => run("Word", () => exportWord(report))}
            disabled={!!busy}
            className="btn-ghost"
          >
            {busy === "Word" ? "Building…" : "Word"}
          </button>
          <button onClick={() => window.print()} className="btn-primary">
            PDF / Print
          </button>
        </div>
      </div>
      {error && <p className="no-print text-sm text-signal-red">{error}</p>}

      {/* ---- The report itself (also the print layout) ---- */}
      <div className="report space-y-6">
        <div className="print-header hidden">
          <h1 className="text-2xl font-semibold text-ink">
            Stratus Financial — {report.title}
          </h1>
          <p className="text-sm text-ink-muted">
            {report.periodLabel} · {report.scopeLabel} · {report.generatedAt}
          </p>
        </div>

        {/* Headline tiles */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Tile
            label="Organization score"
            value={score1(report.org.score)}
            sub={STATUS_LABEL[report.org.status]}
          />
          <Tile label="Departments" value={String(report.org.departments)} sub="reporting" />
          <Tile label="Employees" value={String(report.org.headcount)} sub="in scope" />
          <Tile
            label="Coverage"
            value={`${score1(report.org.coveragePct)}%`}
            sub="scored this month"
          />
        </div>

        {/* Status + coverage breakdown */}
        <div className="card p-5">
          <h2 className="mb-3 text-sm font-semibold text-ink">Where we stand</h2>
          <div className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3 lg:grid-cols-6">
            <Stat label="On track" value={report.org.green} tone="text-signal-green" />
            <Stat label="At risk" value={report.org.amber} tone="text-signal-amber" />
            <Stat label="Off track" value={report.org.red} tone="text-signal-red" />
            <Stat label="Scored" value={report.org.scoredThisMonth} tone="text-signal-green" />
            <Stat label="Stale" value={report.org.stale} tone="text-signal-amber" />
            <Stat
              label="Never scored"
              value={report.org.neverScored}
              tone="text-signal-red"
            />
          </div>
          {report.org.openChallenges > 0 && (
            <p className="mt-3 text-sm text-signal-amber">
              {report.org.openChallenges} challenged evaluation
              {report.org.openChallenges === 1 ? "" : "s"} awaiting a response.
            </p>
          )}
        </div>

        {/* Departments */}
        <Section title="Department scores">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-hairline bg-panel-2 text-left text-xs uppercase tracking-wide text-ink-muted">
                <th className="px-4 py-2 font-medium">Department</th>
                <th className="px-4 py-2 font-medium">Manager</th>
                <th className="px-4 py-2 text-right font-medium">Employees</th>
                <th className="px-4 py-2 text-right font-medium">Score</th>
                <th className="px-4 py-2 text-right font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {report.departments
                .filter((d) => d.headcount > 0)
                .map((d) => (
                  <tr key={d.id}>
                    <td className="px-4 py-2 font-medium text-ink">{d.name}</td>
                    <td className="px-4 py-2 text-ink-muted">{d.managerName}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-ink-muted">
                      {d.headcount}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-ink">
                      {score1(d.score)}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <StatusPill status={d.status} />
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </Section>

        {/* People highlights */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Section title="Top performers">
            <PeopleTable people={report.topPerformers} />
          </Section>
          <Section title="Needs attention">
            <PeopleTable people={report.needsAttention} />
          </Section>
        </div>

        {/* Per-department detail */}
        {report.departments
          .filter((d) => d.headcount > 0)
          .map((d) => (
            <Section
              key={d.id}
              title={d.name}
              subtitle={`${STATUS_LABEL[d.status]} · score ${score1(d.score)} · manager ${d.managerName}`}
            >
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-hairline bg-panel-2 text-left text-xs uppercase tracking-wide text-ink-muted">
                    <th className="px-4 py-2 font-medium">Employee</th>
                    <th className="px-4 py-2 font-medium">Role</th>
                    <th className="px-4 py-2 font-medium">Last scored</th>
                    <th className="px-4 py-2 text-right font-medium">Score</th>
                    <th className="px-4 py-2 text-right font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-hairline">
                  {d.employees.map((e) => (
                    <tr key={`${e.departmentId}/${e.email}`}>
                      <td className="px-4 py-2 font-medium text-ink">{e.name}</td>
                      <td className="px-4 py-2 text-ink-muted">{e.role}</td>
                      <td className="px-4 py-2 text-ink-muted">{e.lastScored || "—"}</td>
                      <td className="px-4 py-2 text-right tabular-nums text-ink">
                        {score1(e.score)}
                      </td>
                      <td className="px-4 py-2 text-right">
                        <StatusPill status={e.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Section>
          ))}
      </div>
    </div>
  );
}

function Tile({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="card p-4">
      <div className="text-xs uppercase tracking-wide text-ink-muted">{label}</div>
      <div className="mt-1 text-3xl font-semibold tabular-nums text-ink">{value}</div>
      <div className="text-xs text-ink-muted">{sub}</div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div>
      <div className={`text-xl font-semibold tabular-nums ${tone}`}>{value}</div>
      <div className="text-xs text-ink-muted">{label}</div>
    </div>
  );
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="card break-inside-avoid overflow-hidden">
      <div className="border-b border-hairline bg-panel-2 px-4 py-2.5">
        <h2 className="text-sm font-semibold text-ink">{title}</h2>
        {subtitle && <p className="text-xs text-ink-muted">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

function PeopleTable({ people }: { people: ReturnType<typeof buildReport>["topPerformers"] }) {
  if (people.length === 0) {
    return (
      <p className="px-4 py-6 text-center text-sm text-ink-muted">
        No evaluations recorded yet.
      </p>
    );
  }
  return (
    <table className="w-full text-sm">
      <tbody className="divide-y divide-hairline">
        {people.map((e) => (
          <tr key={`${e.departmentId}/${e.email}`}>
            <td className="px-4 py-2 font-medium text-ink">{e.name}</td>
            <td className="px-4 py-2 text-ink-muted">{e.departmentName}</td>
            <td className="px-4 py-2 text-right tabular-nums text-ink">
              {score1(e.score)}
            </td>
            <td className="px-4 py-2 text-right">
              <StatusPill status={e.status} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
