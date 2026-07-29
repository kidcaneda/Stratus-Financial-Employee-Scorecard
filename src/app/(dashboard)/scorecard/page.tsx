"use client";

import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useMyRecord, MyRecord } from "@/hooks/useMyRecord";
import { scoreEmployee, scoreMetric, statusFor, fmt } from "@/lib/scoring";
import {
  monthlyScore,
  quarterlyScore,
  yearlyScore,
  parseMonthKey,
  quarterOf,
  MONTH_NAMES,
} from "@/lib/rollup";
import { analyze } from "@/lib/analytics";
import { Period } from "@/types";
import { PeriodSelector, StatusPill, ScoreRing } from "@/components/ui";
import { MonthlyTrend } from "@/components/MonthlyTrend";
import { AnalyticsPanel } from "@/components/AnalyticsPanel";
import { CompetencyView } from "@/components/CompetencyView";
import { GrowHistory, GrowDisplay, hasGrow } from "@/components/GrowNotes";

// ============================================================
// My Scorecard — the signed-in person's OWN scorecard: their recorded
// metrics, their month-by-month history, their evaluator's comments.
// Everything is driven by their employee record (via useMyRecord), not
// by a department template.
// ============================================================

export default function MyScorecardPage() {
  const { user } = useAuth();
  const { records, loading } = useMyRecord();
  const [period, setPeriod] = useState<Period>("monthly");

  if (loading) return <div className="text-sm text-ink-muted">Loading…</div>;

  if (records.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-ink">My Scorecard</h1>
          <p className="text-sm text-ink-muted">{user?.displayName || user?.email}</p>
        </div>
        <div className="card p-8 text-center">
          <h2 className="text-base font-semibold text-ink">No scorecard yet</h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-ink-muted">
            No employee record is linked to your account
            {user?.email ? ` (${user.email})` : ""} yet. Once your evaluator
            records a scorecard for you — or an admin runs the directory
            import — your scores appear here.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-ink">My Scorecard</h1>
          <p className="text-sm text-ink-muted">
            {records[0].emp.name || user?.displayName}
            {records[0].emp.role ? ` · ${records[0].emp.role}` : ""}
          </p>
        </div>
        <PeriodSelector value={period} onChange={setPeriod} />
      </div>

      {records.map((rec) => (
        <ScorecardBlock
          key={`${rec.emp.departmentId}/${rec.emp.id}`}
          rec={rec}
          period={period}
          showHeading={records.length > 1}
        />
      ))}
    </div>
  );
}

function ScorecardBlock({
  rec,
  period,
  showHeading,
}: {
  rec: MyRecord;
  period: Period;
  showHeading: boolean;
}) {
  const { emp, dept, months } = rec;
  const deptName = dept?.name ?? emp.departmentId;
  const isCompetency = emp.type === "competency";

  // Period figures come from the recorded month history when it exists
  // (so Jan–Jul really roll up); otherwise from the record's snapshot.
  const latestKey = months.length ? months[months.length - 1].monthKey : null;
  const latest = latestKey ? parseMonthKey(latestKey) : null;

  const snapshot = scoreEmployee(emp, period);
  const tiles = latest
    ? ([
        {
          label: `${MONTH_NAMES[latest.month - 1]} ${latest.year}`,
          res: monthlyScore(months, latestKey!),
        },
        {
          label: `Q${quarterOf(latest.month)} ${latest.year}`,
          res: quarterlyScore(months, latest.year, quarterOf(latest.month)),
        },
        { label: `${latest.year}`, res: yearlyScore(months, latest.year) },
      ] as const)
    : ([
        { label: "Monthly", res: scoreEmployee(emp, "monthly") },
        { label: "Quarterly", res: scoreEmployee(emp, "quarterly") },
        { label: "Yearly", res: scoreEmployee(emp, "yearly") },
      ] as const);

  // Headline = the selected period's figure, from history when available.
  const headline = latest
    ? period === "monthly"
      ? monthlyScore(months, latestKey!)
      : period === "quarterly"
      ? quarterlyScore(months, latest.year, quarterOf(latest.month))
      : yearlyScore(months, latest.year)
    : snapshot;

  const growMonths = months.filter((m) => hasGrow(m.grow));
  const competencyGrow =
    emp.competency && hasGrow(emp.competency.grow) ? emp.competency.grow : undefined;

  return (
    <div className="space-y-6">
      {showHeading && (
        <h2 className="text-base font-semibold text-ink">{deptName}</h2>
      )}

      {/* Overall + period rollups */}
      <div className="card flex flex-col items-center gap-4 p-6 sm:flex-row sm:gap-8">
        <ScoreRing
          value={isCompetency ? headline.raw : headline.raw}
          status={headline.status}
          size={140}
        />
        <div className="flex-1 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill status={headline.status} />
            <span className="text-sm text-ink-muted">
              {deptName}
              {months.length > 0 &&
                ` · ${months.length} month${months.length === 1 ? "" : "s"} recorded`}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {tiles.map((t) => (
              <div key={t.label} className="rounded-lg bg-panel-2 p-3 text-center">
                <div className="text-xs uppercase tracking-wide text-ink-muted">
                  {t.label}
                </div>
                <div className="text-xl font-semibold tabular-nums text-ink">
                  {fmt(t.res.raw, 0)}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Month-by-month history */}
      {months.length > 0 && (
        <MonthlyTrend
          months={months}
          year={latest?.year ?? new Date().getFullYear()}
        />
      )}

      {/* Competency card, or the KPI metric breakdown */}
      {isCompetency && emp.competency ? (
        // CompetencyView renders a card; give it this person's own ratings.
        <CompetencyView
          dept={{
            id: emp.departmentId,
            name: deptName,
            managerName: emp.evaluatorName ?? "",
            type: "competency",
            metrics: [],
            competency: emp.competency,
          }}
        />
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-hairline bg-panel-2 text-left text-xs uppercase tracking-wide text-ink-muted">
                <th className="px-4 py-3 font-medium">Metric</th>
                <th className="px-4 py-3 text-right font-medium">Target</th>
                <th className="px-4 py-3 text-right font-medium">Actual</th>
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
                    <td className="px-4 py-3 text-right tabular-nums text-ink-muted">
                      {fmt(m.target, 1)} {m.unit}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-ink">
                      {fmt(m.actual[period], 1)} {m.unit}
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
              {emp.metrics.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-ink-muted">
                    No metrics recorded on your scorecard yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Insights from your own recorded months */}
      {months.length > 0 && <AnalyticsPanel report={analyze(months)} />}

      {/* Your evaluator's comments, by month */}
      {growMonths.length > 0 && <GrowHistory growMonths={growMonths} />}
      {growMonths.length === 0 && competencyGrow && (
        <GrowDisplay grow={competencyGrow} subtitle="From your latest review" />
      )}
    </div>
  );
}
