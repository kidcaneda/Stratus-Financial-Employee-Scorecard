"use client";

import { useState } from "react";
import Link from "next/link";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Cell,
  Tooltip,
} from "recharts";
import { useDepartments } from "@/hooks/useDepartments";
import { scoreDepartment, statusFor, fmt } from "@/lib/scoring";
import { Period } from "@/types";
import { PeriodSelector, StatusPill, MockBanner } from "@/components/ui";
import { CountUp } from "@/components/CountUp";

export default function OverviewPage() {
  const { departments, isMock, loading } = useDepartments();
  const [period, setPeriod] = useState<Period>("monthly");

  if (loading) return <div className="text-sm text-ink-muted">Loading…</div>;

  const scored = departments.map((d) => ({
    name: d.name,
    id: d.id,
    score: scoreDepartment(d, period).raw,
    status: scoreDepartment(d, period).status,
  }));

  const counts = scored.reduce(
    (acc, s) => {
      acc[s.status]++;
      return acc;
    },
    { green: 0, amber: 0, red: 0 } as Record<string, number>
  );

  const avg = scored.reduce((s, d) => s + d.score, 0) / (scored.length || 1);
  const color = (st: string) =>
    st === "green" ? "#1F9D6E" : st === "amber" ? "#D99315" : "#D24B4B";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Overview</h1>
          <p className="text-sm text-ink-muted">
            Performance across {departments.length} departments
          </p>
        </div>
        <PeriodSelector value={period} onChange={setPeriod} />
      </div>

      {isMock && <MockBanner />}

      {/* KPI cards */}
      <div className="stagger grid grid-cols-2 gap-4 sm:grid-cols-4">
        <KpiCard label="Avg. score" value={fmt(avg, 0)} sub="weighted" tone="ink" />
        <KpiCard label="On track" value={String(counts.green)} sub="green" tone="green" />
        <KpiCard label="At risk" value={String(counts.amber)} sub="amber" tone="amber" />
        <KpiCard label="Off track" value={String(counts.red)} sub="red" tone="red" />
      </div>

      {/* Department chart */}
      <div className="card p-5">
        <h2 className="mb-4 text-base font-semibold text-ink">
          Department scores · <span className="capitalize text-ink-muted">{period}</span>
        </h2>
        <div style={{ width: "100%", height: 320 }}>
          <ResponsiveContainer>
            <BarChart data={scored} margin={{ left: -10, right: 10, top: 4 }}>
              <XAxis
                dataKey="name"
                tick={{ fontSize: 11, fill: "#5A6B7B" }}
                angle={-25}
                textAnchor="end"
                height={70}
                interval={0}
              />
              <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: "#5A6B7B" }} />
              <Tooltip
                formatter={(v: number) => [`${fmt(v, 1)}`, "Score"]}
                contentStyle={{ borderRadius: 10, border: "1px solid #e2e8f0", fontSize: 12 }}
              />
              <Bar dataKey="score" radius={[6, 6, 0, 0]}>
                {scored.map((s) => (
                  <Cell key={s.id} fill={color(s.status)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Quick list */}
      <div className="card divide-y divide-slate-100">
        {scored
          .sort((a, b) => b.score - a.score)
          .map((s) => (
            <Link
              key={s.id}
              href={`/departments/${s.id}`}
              className="flex items-center justify-between px-5 py-3 transition hover:bg-paper"
            >
              <span className="text-sm font-medium text-ink">{s.name}</span>
              <div className="flex items-center gap-3">
                <span className="text-sm tabular-nums text-ink-muted">{fmt(s.score, 1)}</span>
                <StatusPill status={s.status} />
              </div>
            </Link>
          ))}
      </div>
    </div>
  );
}

function KpiCard({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub: string;
  tone: "ink" | "green" | "amber" | "red";
}) {
  const toneText =
    tone === "green"
      ? "text-signal-green"
      : tone === "amber"
      ? "text-signal-amber"
      : tone === "red"
      ? "text-signal-red"
      : "text-ink";
  const numeric = Number(value);
  return (
    <div className="card p-4 transition-shadow duration-200 hover:shadow-lift">
      <div className="text-xs uppercase tracking-wide text-ink-muted">{label}</div>
      <div className={`mt-1 text-3xl font-semibold tabular-nums ${toneText}`}>
        {isNaN(numeric) ? value : <CountUp value={numeric} />}
      </div>
      <div className="mt-1.5 rule-brass" />
      <div className="mt-1.5 text-xs text-ink-muted">{sub}</div>
    </div>
  );
}
