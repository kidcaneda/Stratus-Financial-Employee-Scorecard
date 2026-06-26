"use client";

import { Department, Criterion } from "@/types";
import { competencyStatus, statusClasses, fmt } from "@/lib/scoring";
import { StatusPill } from "@/components/ui";

// Renders a 1–5 competency scorecard (e.g. Accounting) in its native scale,
// grouped by section, with the overall score out of 5.00 and the band.
export function CompetencyView({ dept }: { dept: Department }) {
  const card = dept.competency;
  if (!card) return null;

  const status = competencyStatus(card.overall);
  const c = statusClasses(status);

  // Group criteria by section, preserving first-seen order.
  const sections: { name: string; items: Criterion[] }[] = [];
  for (const crit of card.criteria) {
    let sec = sections.find((s) => s.name === crit.section);
    if (!sec) {
      sec = { name: crit.section || "Other", items: [] };
      sections.push(sec);
    }
    sec.items.push(crit);
  }

  return (
    <div className="space-y-6">
      {/* Overall summary — native 1–5 scale */}
      <div className="card flex flex-col items-start gap-4 p-6 sm:flex-row sm:items-center sm:gap-8">
        <div className="flex flex-col items-center">
          <div className={`text-5xl font-semibold tabular-nums ${c.text}`}>
            {fmt(card.overall, 2)}
          </div>
          <div className="text-xs uppercase tracking-wide text-ink-muted">
            out of 5.00
          </div>
        </div>
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <StatusPill status={status} />
            {card.band && (
              <span className={`pill ${c.bg} ${c.text}`}>{card.band}</span>
            )}
          </div>
          <p className="max-w-md text-sm text-ink-muted">
            Competency review across {card.criteria.length} weighted criteria,
            rated on a 1–5 scale. This department uses a different evaluation
            model than the KPI scorecards.
          </p>
        </div>
      </div>

      {/* Criteria grouped by section */}
      {sections.map((sec) => {
        const sectionWeight = sec.items.reduce((s, i) => s + i.weight, 0);
        return (
          <div key={sec.name} className="card overflow-hidden">
            <div className="flex items-center justify-between border-b border-hairline bg-panel-2 px-4 py-2.5">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-ink">
                {sec.name}
              </h3>
              <span className="text-xs text-ink-muted">
                Section weight {fmt(sectionWeight * 100, 0)}%
              </span>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-hairline text-left text-xs uppercase tracking-wide text-ink-muted">
                  <th className="px-4 py-2 font-medium">#</th>
                  <th className="px-4 py-2 font-medium">Criterion</th>
                  <th className="px-4 py-2 text-right font-medium">Weight</th>
                  <th className="px-4 py-2 text-right font-medium">Score</th>
                  <th className="px-4 py-2 text-right font-medium">Weighted</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline">
                {sec.items.map((crit) => (
                  <tr key={crit.id} className="hover:bg-panel-2">
                    <td className="px-4 py-3 tabular-nums text-ink-muted">
                      {crit.number}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-ink">{crit.name}</div>
                      {crit.descriptor && (
                        <div className="mt-0.5 text-xs text-ink-muted">
                          {crit.descriptor}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-ink-muted">
                      {fmt(crit.weight * 100, 0)}%
                    </td>
                    <td className="px-4 py-3 text-right">
                      <ScorePips score={crit.score} />
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-ink">
                      {fmt(crit.weighted, 2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}

// Visual 1–5 score as filled pips, with the number alongside.
function ScorePips({ score }: { score: number }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="inline-flex gap-0.5">
        {[1, 2, 3, 4, 5].map((n) => (
          <span
            key={n}
            className={`h-2 w-2 rounded-full ${
              n <= score ? "bg-ink" : "bg-hairline"
            }`}
          />
        ))}
      </span>
      <span className="tabular-nums text-ink">{score}</span>
    </span>
  );
}
