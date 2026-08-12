"use client";

import Link from "next/link";
import { PriorAssignment } from "@/hooks/usePersonHistory";
import { scoreMonth, parseMonthKey, MONTH_NAMES } from "@/lib/rollup";
import { statusFor, statusClasses, fmt } from "@/lib/scoring";

// ============================================================
// A person's evaluations from other departments — the record left
// behind when they transferred. Scorecards are stored per department,
// so this keeps the earlier history reachable from wherever the person
// is now.
// ============================================================

const label = (monthKey: string) => {
  const { year, month } = parseMonthKey(monthKey);
  return `${MONTH_NAMES[month - 1]} ${year}`;
};

export function PriorAssignments({
  assignments,
  heading = "Evaluations in other departments",
}: {
  assignments: PriorAssignment[];
  heading?: string;
}) {
  if (assignments.length === 0) return null;

  return (
    <div className="card p-5">
      <h3 className="mb-1 text-sm font-semibold text-ink">{heading}</h3>
      <p className="mb-3 text-xs text-ink-muted">
        Kept from previous assignments — moving department never removes
        recorded evaluations.
      </p>

      <div className="space-y-4">
        {assignments.map((a) => {
          const avg =
            a.months.reduce((s, m) => s + scoreMonth(m), 0) / a.months.length;
          const st = statusFor(avg);
          const c = statusClasses(st);
          const first = a.months[0];
          const last = a.months[a.months.length - 1];

          return (
            <div
              key={`${a.emp.departmentId}/${a.emp.id}`}
              className="overflow-hidden rounded-xl border border-hairline"
            >
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline bg-panel-2 px-4 py-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-ink">
                    {a.departmentName}
                  </span>
                  {a.emp.archived && (
                    <span className="pill bg-panel text-ink-muted">Previous</span>
                  )}
                  <span className="text-xs text-ink-muted">
                    {a.months.length} month{a.months.length === 1 ? "" : "s"} ·{" "}
                    {label(first.monthKey)}
                    {a.months.length > 1 ? ` – ${label(last.monthKey)}` : ""}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-sm font-semibold tabular-nums ${c.text}`}>
                    {fmt(avg, 1)}
                  </span>
                  <span className="text-xs text-ink-muted">avg</span>
                  <Link
                    href={`/departments/${a.emp.departmentId}/employees/${a.emp.id}`}
                    className="btn-ghost"
                  >
                    Open
                  </Link>
                </div>
              </div>

              <table className="w-full text-sm">
                <tbody className="divide-y divide-hairline">
                  {[...a.months]
                    .sort((x, y) => y.monthKey.localeCompare(x.monthKey))
                    .map((m) => {
                      const s = scoreMonth(m);
                      const ms = statusClasses(statusFor(s));
                      return (
                        <tr key={m.monthKey} className="hover:bg-panel-2">
                          <td className="px-4 py-2 text-ink">{label(m.monthKey)}</td>
                          <td className="px-4 py-2 text-ink-muted">
                            {m.recordedByName ? `by ${m.recordedByName}` : ""}
                          </td>
                          <td className="px-4 py-2 text-right">
                            {m.ackStatus === "disputed" && (
                              <span className="pill bg-signal-amberbg text-signal-amber">
                                Challenged
                              </span>
                            )}
                            {m.ackStatus === "acknowledged" && (
                              <span className="pill bg-signal-greenbg text-signal-green">
                                Accepted
                              </span>
                            )}
                          </td>
                          <td
                            className={`px-4 py-2 text-right font-medium tabular-nums ${ms.text}`}
                          >
                            {fmt(s, 1)}
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          );
        })}
      </div>
    </div>
  );
}
