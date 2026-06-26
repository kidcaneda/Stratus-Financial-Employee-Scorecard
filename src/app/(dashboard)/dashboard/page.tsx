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
import { useAuth } from "@/hooks/useAuth";
import { scoreDepartment, fmt } from "@/lib/scoring";
import { Period } from "@/types";
import { PeriodSelector, StatusPill, MockBanner } from "@/components/ui";
import { CountUp } from "@/components/CountUp";
import { Gauge } from "@/components/Gauge";
import { GreetingHeader, EncouragementChip, Podium, RankedItem } from "@/components/Dashboard";

export default function OverviewPage() {
  const { departments, isMock, loading } = useDepartments();
  const { user } = useAuth();
  const [period, setPeriod] = useState<Period>("monthly");

  if (loading) return <div className="text-sm text-ink-muted">Loading…</div>;

  const scored = departments.map((d) => {
    const res = scoreDepartment(d, period);
    return { name: d.name, id: d.id, score: res.raw, status: res.status };
  });

  const counts = scored.reduce(
    (acc, s) => {
      acc[s.status]++;
      return acc;
    },
    { green: 0, amber: 0, red: 0 } as Record<string, number>
  );

  const avg = scored.reduce((s, d) => s + d.score, 0) / (scored.length || 1);
  const avgStatus = avg >= 90 ? "green" : avg >= 70 ? "amber" : "red";
  const color = (st: string) =>
    st === "green" ? "#34D399" : st === "amber" ? "#FBBF24" : "#F87171";

  const ranked: RankedItem[] = scored.map((s) => ({
    id: s.id,
    name: s.name,
    score: s.score,
    status: s.status,
  }));

  const firstName = (user?.displayName || "there").split(/[\s@]/)[0];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <GreetingHeader
          name={firstName}
          subtitle={`Performance across ${departments.length} departments`}
        />
        <PeriodSelector value={period} onChange={setPeriod} />
      </div>

      {isMock && <MockBanner />}

      {/* Top row: gauge + KPI tiles */}
      <div className="stagger grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Org gauge */}
        <div className="card flex flex-col items-center justify-center p-6">
          <div className="mb-1 self-start text-xs uppercase tracking-wide text-ink-muted">
            Organization score
          </div>
          <Gauge value={avg} status={avgStatus as any} label="weighted" />
          <div className="mt-2">
            <EncouragementChip score={avg} />
          </div>
        </div>

        {/* KPI tiles */}
        <div className="grid grid-cols-2 gap-4 lg:col-span-2">
          <KpiTile label="On track" value={counts.green} tone="green" caption="green" />
          <KpiTile label="At risk" value={counts.amber} tone="amber" caption="amber" />
          <KpiTile label="Off track" value={counts.red} tone="red" caption="red" />
          <KpiTile label="Departments" value={departments.length} tone="ink" caption="total" />
        </div>
      </div>

      {/* Department chart + podium */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="card p-5 lg:col-span-2">
          <h2 className="mb-4 text-base font-semibold text-ink">
            Department scores · <span className="capitalize text-ink-muted">{period}</span>
          </h2>
          <div style={{ width: "100%", height: 320 }}>
            <ResponsiveContainer>
              <BarChart data={scored} margin={{ left: -10, right: 10, top: 4 }}>
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 11, fill: "#6B7A99" }}
                  angle={-25}
                  textAnchor="end"
                  height={70}
                  interval={0}
                />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: "#6B7A99" }} />
                <Tooltip
                  cursor={{ fill: "rgba(91,141,239,0.08)" }}
                  formatter={(v: number) => [`${fmt(v, 1)}`, "Score"]}
                  contentStyle={{
                    borderRadius: 10,
                    border: "1px solid #26334D",
                    background: "#131C2E",
                    color: "#EAF0FB",
                    fontSize: 12,
                  }}
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

        {/* Podium leaderboard */}
        <div className="card p-5">
          <h2 className="mb-4 text-base font-semibold text-ink">Top performers</h2>
          <Podium items={ranked} />
        </div>
      </div>
    </div>
  );
}

function KpiTile({
  label,
  value,
  tone,
  caption,
}: {
  label: string;
  value: number;
  tone: "ink" | "green" | "amber" | "red";
  caption: string;
}) {
  const toneText =
    tone === "green"
      ? "text-signal-green"
      : tone === "amber"
      ? "text-signal-amber"
      : tone === "red"
      ? "text-signal-red"
      : "text-ink";
  return (
    <div className="card card-hover flex flex-col justify-between p-5">
      <div className="text-xs uppercase tracking-wide text-ink-muted">{label}</div>
      <div className={`mt-2 text-4xl font-semibold tabular-nums ${toneText}`}>
        <CountUp value={value} />
      </div>
      <div className="mt-1 text-xs text-ink-muted">{caption}</div>
    </div>
  );
}
