"use client";

import Link from "next/link";
import { OpenChallenge } from "@/hooks/useOpenChallenges";

// ============================================================
// Surfaces challenged evaluations awaiting a leader's response, so
// they don't have to be discovered by visiting each employee page.
// Each row links straight to that employee's scorecard, where the
// Respond control lives.
// ============================================================

export function ChallengesBanner({ challenges }: { challenges: OpenChallenge[] }) {
  if (challenges.length === 0) return null;

  return (
    <div className="card border-signal-amber/40 p-5">
      <div className="mb-3 flex items-center gap-2">
        <span className="grid h-6 w-6 place-items-center rounded-full bg-signal-amberbg text-signal-amber">
          !
        </span>
        <h3 className="text-sm font-semibold text-ink">
          {challenges.length} challenged evaluation
          {challenges.length === 1 ? "" : "s"} awaiting your response
        </h3>
      </div>
      <div className="space-y-2">
        {challenges.map((c) => (
          <div
            key={`${c.departmentId}/${c.employeeId}/${c.monthKey}`}
            className="flex flex-wrap items-start gap-3 rounded-lg bg-panel-2 p-3"
          >
            <span className="text-sm font-medium text-ink">{c.employeeName}</span>
            <span className="text-sm tabular-nums text-ink-muted">{c.monthKey}</span>
            {c.comment && (
              <p className="min-w-[10rem] flex-1 truncate text-sm text-ink-muted">
                “{c.comment}”
              </p>
            )}
            <Link
              href={`/departments/${c.departmentId}/employees/${c.employeeId}`}
              className="ml-auto rounded-lg border border-accent/40 px-3 py-1.5 text-sm font-medium text-accent transition-colors hover:bg-accent/10"
            >
              Review &amp; respond
            </Link>
          </div>
        ))}
      </div>
    </div>
  );
}
