"use client";

import { useState } from "react";
import Link from "next/link";
import { useDepartments } from "@/hooks/useDepartments";
import { scoreDepartment, trendDelta, fmt } from "@/lib/scoring";
import { Period } from "@/types";
import { PeriodSelector, StatusPill, MockBanner } from "@/components/ui";

export default function TeamPage() {
  const { departments, isMock, loading } = useDepartments();
  const [period, setPeriod] = useState<Period>("monthly");
  const [query, setQuery] = useState("");

  if (loading) return <div className="text-sm text-ink-muted">Loading…</div>;

  const rows = departments
    .filter((d) => d.name.toLowerCase().includes(query.toLowerCase()))
    .map((d) => ({
      id: d.id,
      name: d.name,
      manager: d.managerName,
      res: scoreDepartment(d, period),
      delta: trendDelta(d),
    }))
    .sort((a, b) => b.res.raw - a.res.raw);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Team View</h1>
          <p className="text-sm text-ink-muted">All departments ranked by score</p>
        </div>
        <PeriodSelector value={period} onChange={setPeriod} />
      </div>

      {isMock && <MockBanner />}

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search departments…"
        className="w-full max-w-xs rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
      />

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-paper text-left text-xs uppercase tracking-wide text-ink-muted">
              <th className="px-4 py-3 font-medium">Department</th>
              <th className="px-4 py-3 font-medium">Manager</th>
              <th className="px-4 py-3 text-right font-medium">Score</th>
              <th className="px-4 py-3 text-right font-medium">Trend</th>
              <th className="px-4 py-3 text-right font-medium">Status</th>
              <th className="px-4 py-3 text-right font-medium"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => (
              <tr key={r.id} className="hover:bg-paper">
                <td className="px-4 py-3 font-medium text-ink">{r.name}</td>
                <td className="px-4 py-3 text-ink-muted">{r.manager}</td>
                <td className="px-4 py-3 text-right tabular-nums text-ink">
                  {fmt(r.res.raw, 1)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">
                  <span
                    className={
                      r.delta >= 0 ? "text-signal-green" : "text-signal-red"
                    }
                  >
                    {r.delta >= 0 ? "▲" : "▼"} {fmt(Math.abs(r.delta), 1)}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <StatusPill status={r.res.status} />
                </td>
                <td className="px-4 py-3 text-right">
                  <Link href={`/departments/${r.id}`} className="btn-ghost">
                    View
                  </Link>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-ink-muted">
                  No departments match “{query}”.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
