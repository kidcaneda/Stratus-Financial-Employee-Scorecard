"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/hooks/useAuth";
import { useAllEmployees } from "@/hooks/useAllEmployees";
import { scoreEmployee, fmt } from "@/lib/scoring";
import { Employee, Period } from "@/types";
import { PeriodSelector, StatusPill, MockBanner } from "@/components/ui";
import { EvaluationForm } from "@/components/EvaluationForm";

// ============================================================
// Audit (admin only) — utilization & performance across ALL employees.
// "Utilization" here means evaluation coverage: who has been scored this
// month, whose record has gone stale, who has never been scored at all.
// Exports the current view as CSV for the audit deliverable.
// ============================================================

type Recency = "current" | "stale" | "never";

interface AuditRow {
  e: Employee;
  deptName: string;
  score: number;
  status: ReturnType<typeof scoreEmployee>["status"];
  recency: Recency;
}

const RECENCY_LABEL: Record<Recency, string> = {
  current: "Scored this month",
  stale: "Stale",
  never: "Never scored",
};

export default function AuditPage() {
  const { user } = useAuth();
  const { employees, departments, isMock, loading, refresh } = useAllEmployees();
  const [period, setPeriod] = useState<Period>("monthly");
  const [filter, setFilter] = useState<Recency | "all">("all");
  const [query, setQuery] = useState("");
  const [scoring, setScoring] = useState<Employee | null>(null);

  if (user && user.role !== "admin") {
    return (
      <div className="card p-6">
        <h1 className="text-lg font-semibold text-ink">Restricted</h1>
        <p className="mt-1 text-sm text-ink-muted">
          The audit view is available to administrators only.
        </p>
      </div>
    );
  }

  if (loading) return <div className="text-sm text-ink-muted">Loading…</div>;

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const monthStartMs = monthStart.getTime();

  const deptName = (id: string) =>
    departments.find((d) => d.id === id)?.name ?? id;

  const rows: AuditRow[] = employees.map((e) => {
    const res = scoreEmployee(e, period);
    const recency: Recency = !e.updatedAt
      ? "never"
      : e.updatedAt >= monthStartMs
      ? "current"
      : "stale";
    return { e, deptName: deptName(e.departmentId), score: res.raw, status: res.status, recency };
  });

  const counts = {
    all: rows.length,
    current: rows.filter((r) => r.recency === "current").length,
    stale: rows.filter((r) => r.recency === "stale").length,
    never: rows.filter((r) => r.recency === "never").length,
  };

  const q = query.toLowerCase();
  const visible = rows
    .filter((r) => filter === "all" || r.recency === filter)
    .filter(
      (r) =>
        !q ||
        r.e.name.toLowerCase().includes(q) ||
        r.deptName.toLowerCase().includes(q) ||
        (r.e.evaluatorName ?? "").toLowerCase().includes(q)
    )
    // Audit ordering: never-scored first, then oldest touch, so the rows
    // needing attention surface at the top.
    .sort((a, b) => (a.e.updatedAt ?? 0) - (b.e.updatedAt ?? 0));

  const exportCsv = () => {
    const header = [
      "Name", "Email", "Department", "Role", "Evaluator",
      `Score (${period})`, "Status", "Coverage", "Last updated",
    ];
    const lines = visible.map((r) =>
      [
        r.e.name, r.e.email, r.deptName, r.e.role, r.e.evaluatorName ?? "",
        fmt(r.score, 1), r.status, RECENCY_LABEL[r.recency],
        r.e.updatedAt ? new Date(r.e.updatedAt).toISOString() : "",
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(",")
    );
    const blob = new Blob([[header.join(","), ...lines].join("\n")], {
      type: "text/csv;charset=utf-8",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `employee-audit-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Audit</h1>
          <p className="text-sm text-ink-muted">
            Utilization &amp; performance across every employee
          </p>
        </div>
        <div className="flex items-center gap-3">
          <PeriodSelector value={period} onChange={setPeriod} />
          <button onClick={exportCsv} className="btn-primary">
            Export CSV
          </button>
        </div>
      </div>

      {isMock && <MockBanner />}

      {/* Coverage tiles double as filters. */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Tile
          label="Employees"
          value={counts.all}
          active={filter === "all"}
          onClick={() => setFilter("all")}
        />
        <Tile
          label="Scored this month"
          value={counts.current}
          tone="text-signal-green"
          active={filter === "current"}
          onClick={() => setFilter("current")}
        />
        <Tile
          label="Stale"
          value={counts.stale}
          tone="text-signal-amber"
          active={filter === "stale"}
          onClick={() => setFilter("stale")}
        />
        <Tile
          label="Never scored"
          value={counts.never}
          tone="text-signal-red"
          active={filter === "never"}
          onClick={() => setFilter("never")}
        />
      </div>

      {/* Inline score entry: admins can evaluate anyone right from the
          audit table. The form needs the department's template. */}
      {scoring &&
        (() => {
          const dept = departments.find((d) => d.id === scoring.departmentId);
          if (!dept) return null;
          return (
            <EvaluationForm
              key={scoring.id}
              dept={dept}
              existing={scoring}
              onSaved={() => {
                setScoring(null);
                refresh();
              }}
              onCancel={() => setScoring(null)}
            />
          );
        })()}

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search by name, department, or evaluator…"
        className="w-full max-w-sm rounded-lg border border-hairline bg-panel-2 px-3 py-2 text-sm text-ink placeholder:text-ink-muted focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
      />

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-hairline bg-panel-2 text-left text-xs uppercase tracking-wide text-ink-muted">
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Department</th>
              <th className="px-4 py-3 font-medium">Evaluator</th>
              <th className="px-4 py-3 text-right font-medium">Score</th>
              <th className="px-4 py-3 text-right font-medium">Status</th>
              <th className="px-4 py-3 text-right font-medium">Coverage</th>
              <th className="px-4 py-3 text-right font-medium"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-hairline">
            {visible.map((r) => (
              <tr key={`${r.e.departmentId}/${r.e.id}`} className="hover:bg-panel-2">
                <td className="px-4 py-3">
                  <div className="font-medium text-ink">{r.e.name}</div>
                  <div className="text-xs text-ink-muted">{r.e.role}</div>
                </td>
                <td className="px-4 py-3 text-ink-muted">{r.deptName}</td>
                <td className="px-4 py-3 text-ink-muted">{r.e.evaluatorName || "—"}</td>
                <td className="px-4 py-3 text-right tabular-nums text-ink">
                  {fmt(r.score, 1)}
                </td>
                <td className="px-4 py-3 text-right">
                  <StatusPill status={r.status} />
                </td>
                <td className="px-4 py-3 text-right">
                  <CoverageBadge recency={r.recency} updatedAt={r.e.updatedAt} />
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex justify-end gap-2">
                    {departments.some((d) => d.id === r.e.departmentId) && (
                      <button
                        onClick={() => {
                          setScoring(r.e);
                          window.scrollTo({ top: 0, behavior: "smooth" });
                        }}
                        className="rounded-lg border border-transparent px-3 py-1.5 text-sm font-medium text-accent transition-all hover:border-accent/40 hover:bg-accent/10 active:scale-[0.98]"
                      >
                        {r.e.type === "competency" ? "Review" : "Score"}
                      </button>
                    )}
                    <Link
                      href={`/departments/${r.e.departmentId}/employees/${r.e.id}`}
                      className="btn-ghost"
                    >
                      View
                    </Link>
                  </div>
                </td>
              </tr>
            ))}
            {visible.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-ink-muted">
                  No employees match the current filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Tile({
  label,
  value,
  tone,
  active,
  onClick,
}: {
  label: string;
  value: number;
  tone?: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`card p-4 text-left transition-all ${
        active ? "border-accent ring-1 ring-accent/30" : "hover:border-accent/40"
      }`}
    >
      <div className="text-xs uppercase tracking-wide text-ink-muted">{label}</div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${tone ?? "text-ink"}`}>
        {value}
      </div>
    </button>
  );
}

function CoverageBadge({ recency, updatedAt }: { recency: Recency; updatedAt?: number }) {
  const cls =
    recency === "current"
      ? "bg-signal-green/15 text-signal-green"
      : recency === "stale"
      ? "bg-signal-amber/15 text-signal-amber"
      : "bg-signal-red/15 text-signal-red";
  return (
    <span className={`pill ${cls}`} title={updatedAt ? new Date(updatedAt).toLocaleString() : undefined}>
      {RECENCY_LABEL[recency]}
    </span>
  );
}
