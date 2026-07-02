"use client";

import { AnalyticsReport, Insight } from "@/lib/analytics";

// Renders the rule-based analytics report. Clearly labeled as a
// data-derived draft for human review — not an authoritative verdict.
// Motion: the panel reveals on mount and each insight staggers in, with
// animated meter bars summarising the signal mix.
export function AnalyticsPanel({ report }: { report: AnalyticsReport }) {
  if (report.monthsAnalyzed === 0) {
    return (
      <div className="card animate-fade-up p-6 text-sm text-ink-muted">
        {report.summary}
      </div>
    );
  }

  const total =
    report.strengths.length +
    report.opportunities.length +
    report.actions.length || 1;

  const bars = [
    { label: "Strengths", n: report.strengths.length, color: "bg-signal-green" },
    { label: "Opportunities", n: report.opportunities.length, color: "bg-signal-amber" },
    { label: "Actions", n: report.actions.length, color: "bg-accent" },
  ];

  return (
    <div className="card animate-fade-up overflow-hidden">
      <div className="border-b border-hairline bg-panel-2 px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-accent/15 text-accent">
              ✦
            </span>
            <h3 className="text-sm font-semibold text-ink">Performance analysis</h3>
          </div>
          <span className="pill bg-panel text-ink-muted">
            Data-derived · review before sharing
          </span>
        </div>
        <p className="mt-2 text-sm text-ink-muted">{report.summary}</p>

        {/* Signal-mix meter */}
        <div className="mt-3 flex flex-wrap items-center gap-4">
          {bars.map((b) => (
            <div key={b.label} className="flex items-center gap-2">
              <span className={`h-2 w-2 rounded-full ${b.color}`} />
              <span className="text-xs text-ink-muted">
                {b.label} <span className="tabular-nums text-ink">{b.n}</span>
              </span>
            </div>
          ))}
        </div>
        <div className="mt-2 flex h-1.5 overflow-hidden rounded-full bg-panel">
          {bars.map((b) => (
            <div
              key={b.label}
              className={`${b.color} transition-all duration-700 ease-out`}
              style={{ width: `${(b.n / total) * 100}%` }}
            />
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 divide-y divide-hairline md:grid-cols-3 md:divide-x md:divide-y-0">
        <Column
          title="Strengths"
          dot="bg-signal-green"
          accent="text-signal-green"
          insights={report.strengths}
          empty="No standout strengths yet — keep recording months."
        />
        <Column
          title="Opportunities"
          dot="bg-signal-amber"
          accent="text-signal-amber"
          insights={report.opportunities}
          empty="No opportunity areas flagged."
        />
        <Column
          title="Recommended actions"
          dot="bg-accent"
          accent="text-accent"
          insights={report.actions}
          empty="No specific actions needed right now."
        />
      </div>

      <div className="border-t border-hairline bg-panel-2 px-5 py-2.5">
        <p className="text-xs text-ink-muted">
          These observations are generated from recorded scores using fixed
          rules. They are a starting point for discussion, not a final
          assessment — a leader should review and adjust them.
        </p>
      </div>
    </div>
  );
}

function Column({
  title,
  accent,
  dot,
  insights,
  empty,
}: {
  title: string;
  accent: string;
  dot: string;
  insights: Insight[];
  empty: string;
}) {
  return (
    <div className="p-5">
      <div className="mb-3 flex items-center justify-between">
        <h4 className={`text-xs font-semibold uppercase tracking-wide ${accent}`}>
          {title}
        </h4>
        <span className="rounded-full bg-panel-2 px-2 py-0.5 text-[10px] tabular-nums text-ink-muted">
          {insights.length}
        </span>
      </div>
      {insights.length === 0 ? (
        <p className="text-sm text-ink-muted">{empty}</p>
      ) : (
        <ul className="stagger space-y-3">
          {insights.map((ins, i) => (
            <li
              key={i}
              className="flex gap-2.5 rounded-lg border border-transparent p-2 transition-colors hover:border-hairline hover:bg-panel-2/50"
            >
              <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} />
              <div>
                <div className="text-sm text-ink">{ins.text}</div>
                <div className="mt-0.5 text-xs text-ink-muted">{ins.evidence}</div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
