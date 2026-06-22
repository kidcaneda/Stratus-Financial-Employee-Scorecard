"use client";

import { useState } from "react";
import Link from "next/link";
import { useDepartments } from "@/hooks/useDepartments";
import { scoreDepartment, fmt } from "@/lib/scoring";
import { Period } from "@/types";
import { PeriodSelector, StatusPill, MockBanner } from "@/components/ui";

export default function DepartmentsPage() {
  const { departments, isMock, loading } = useDepartments();
  const [period, setPeriod] = useState<Period>("monthly");

  if (loading) return <div className="text-sm text-ink-muted">Loading…</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Departments</h1>
          <p className="text-sm text-ink-muted">Select a department to view its scorecard</p>
        </div>
        <PeriodSelector value={period} onChange={setPeriod} />
      </div>

      {isMock && <MockBanner />}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {departments.map((d) => {
          const res = scoreDepartment(d, period);
          const barColor =
            res.status === "green"
              ? "bg-signal-green"
              : res.status === "amber"
              ? "bg-signal-amber"
              : "bg-signal-red";
          return (
            <Link
              key={d.id}
              href={`/departments/${d.id}`}
              className="card group p-5 transition hover:shadow-md"
            >
              <div className="mb-3 flex items-start justify-between">
                <h2 className="text-base font-semibold text-ink">{d.name}</h2>
                <StatusPill status={res.status} />
              </div>
              <div className="mb-2 flex items-baseline gap-1">
                <span className="text-3xl font-semibold tabular-nums text-ink">
                  {fmt(res.raw, 0)}
                </span>
                <span className="text-sm text-ink-muted">/ 100</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                <div
                  className={`h-full rounded-full ${barColor} transition-all`}
                  style={{ width: `${Math.min(100, res.raw)}%` }}
                />
              </div>
              <div className="mt-3 text-xs text-ink-muted">
                {d.metrics.length} metrics · {d.managerName}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
