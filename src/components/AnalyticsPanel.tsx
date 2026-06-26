"use client";

import { AnalyticsReport } from "@/lib/analytics";

// Renders the rule-based analytics report. Clearly labeled as a
// data-derived draft for human review — not an authoritative verdict.
export function AnalyticsPanel({ report }: { report: AnalyticsReport }) {
  if (report.monthsAnalyzed === 0) {
    return (
      <div className="card p-6 text-sm text-ink-muted">{report.summary}</div>
    );
  }

  return (
    <div className="card overflow-hidden">
      <div className="border-b border-slate-200 bg-paper px-5 py-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-ink">Performance analysis</h3>
          <span className="pill bg-white text-ink-muted">
            Data-derived · review before sharing
          </span>
        </div>
        <p className="mt-1 text-sm text-ink-muted">{report.summary}</p>
      </div>

      <div className="grid grid-cols-1 divide-y divide-slate-100 md:grid-cols-3 md:divide-x md:divide-y-0">
        <Column
          title="Strengths"
          accent="text-signal-green"
          insights={report.strengths}
          empty="No standout strengths yet — keep recording months."
        />
        <Column
          title="Opportunities"
          accent="text-signal-amber"
          insights={report.opportunities}
          empty="No opportunity areas flagged."
        />
        <Column
          title="Recommended actions"
          accent="text-accent"
          insights={report.actions}
          empty="No specific actions needed right now."
        />
      </div>

      <div className="border-t border-slate-200 bg-paper px-5 py-2.5">
        <p className="text-xs text-ink-muted">
          These observations are generated from recorded scores using fixed
          rules. They are a starting point for discussion, not a final
          assessment — a manager should review and adjust them.
        </p>
      </div>
    </div>
  );
}

function Column({
  title,
  accent,
  insights,
  empty,
}: {
  title: string;
  accent: string;
  insights: { text: string; evidence: string }[];
  empty: string;
}) {
  return (
    <div className="p-5">
      <h4 className={`mb-3 text-xs font-semibold uppercase tracking-wide ${accent}`}>
        {title}
      </h4>
      {insights.length === 0 ? (
        <p className="text-sm text-ink-muted">{empty}</p>
      ) : (
        <ul className="space-y-3">
          {insights.map((ins, i) => (
            <li key={i} className="text-sm">
              <div className="text-ink">{ins.text}</div>
              <div className="mt-0.5 text-xs text-ink-muted">{ins.evidence}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
