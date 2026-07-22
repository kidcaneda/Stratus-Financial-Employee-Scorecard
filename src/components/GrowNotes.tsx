"use client";

import { useMemo, useState } from "react";
import { GrowComments, MonthlyEvaluation, Quarter } from "@/types";
import { MONTH_NAMES, parseMonthKey, quarterOf } from "@/lib/rollup";

// ============================================================
// GROW-style evaluator commentary: input group (used inside the
// score/review forms) and read-only display (employee detail page,
// My Evaluations).
// ============================================================

export const GROW_FIELDS: {
  key: keyof GrowComments;
  label: string;
  hint: string;
}[] = [
  { key: "goals", label: "Goals", hint: "What are we aiming for this period?" },
  {
    key: "realities",
    label: "Realities (Root Cause)",
    hint: "What actually happened, and why?",
  },
  {
    key: "opportunities",
    label: "Opportunities",
    hint: "What could have been done better?",
  },
  {
    key: "wayForward",
    label: "Way Forward (Action plans)",
    hint: "Concrete next steps and commitments.",
  },
];

export const emptyGrow = (): GrowComments => ({
  goals: "",
  realities: "",
  opportunities: "",
  wayForward: "",
});

export function hasGrow(g?: GrowComments | null): boolean {
  return !!g && GROW_FIELDS.some((f) => (g[f.key] ?? "").trim() !== "");
}

export function trimGrow(g: GrowComments): GrowComments {
  return {
    goals: g.goals.trim(),
    realities: g.realities.trim(),
    opportunities: g.opportunities.trim(),
    wayForward: g.wayForward.trim(),
  };
}

// Four labeled comment boxes for the evaluator, shown inside the forms.
export function GrowInput({
  value,
  onChange,
}: {
  value: GrowComments;
  onChange: (v: GrowComments) => void;
}) {
  return (
    <div>
      <h4 className="mb-1 text-sm font-semibold text-ink">Evaluator comments</h4>
      <p className="mb-3 text-xs text-ink-muted">
        Optional, but powerful: these notes are shown to the employee with
        their evaluation.
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {GROW_FIELDS.map((f) => (
          <div key={f.key}>
            <label className="mb-1 block text-sm font-medium text-ink">
              {f.label}
            </label>
            <textarea
              value={value[f.key]}
              onChange={(e) => onChange({ ...value, [f.key]: e.target.value })}
              placeholder={f.hint}
              className="h-20 w-full resize-none rounded-lg border border-hairline bg-panel-2 p-3 text-sm text-ink placeholder:text-ink-muted focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
            />
          </div>
        ))}
      </div>
    </div>
  );
}

// Read-only rendering of saved commentary.
export function GrowDisplay({
  grow,
  title = "Evaluator comments",
  subtitle,
}: {
  grow: GrowComments;
  title?: string;
  subtitle?: string;
}) {
  return (
    <div className="card p-5">
      <div className="mb-3">
        <h3 className="text-sm font-semibold text-ink">{title}</h3>
        {subtitle && <p className="text-xs text-ink-muted">{subtitle}</p>}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {GROW_FIELDS.filter((f) => (grow[f.key] ?? "").trim() !== "").map((f) => (
          <div key={f.key} className="rounded-lg bg-panel-2 p-3">
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-soft">
              {f.label}
            </div>
            <p className="whitespace-pre-wrap text-sm text-ink-muted">{grow[f.key]}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================
// GrowHistory: evaluator-comments timeline with a Month / Quarter / All
// picker. Only periods that actually carry commentary are offered, and
// only the selected period's cards render — so the page stays compact
// even after years of monthly evaluations. Defaults to the latest month.
// ============================================================

type Scope = "month" | "quarter" | "all";

function monthLabel(key: string): string {
  const { year, month } = parseMonthKey(key);
  return `${MONTH_NAMES[month - 1]} ${year}`;
}
function quarterKey(key: string): string {
  const { year, month } = parseMonthKey(key);
  return `${year}-Q${quarterOf(month)}`;
}
function quarterLabel(qKey: string): string {
  const [year, q] = qKey.split("-");
  return `${q} ${year}`;
}

export function GrowHistory({
  growMonths,
}: {
  // Months carrying commentary, any order (sorted internally, newest first).
  growMonths: MonthlyEvaluation[];
}) {
  const sorted = useMemo(
    () => [...growMonths].sort((a, b) => b.monthKey.localeCompare(a.monthKey)),
    [growMonths]
  );

  // Distinct months and quarters that have commentary (newest first).
  const monthKeys = useMemo(() => sorted.map((m) => m.monthKey), [sorted]);
  const quarterKeys = useMemo(() => {
    const seen: string[] = [];
    for (const m of sorted) {
      const q = quarterKey(m.monthKey);
      if (!seen.includes(q)) seen.push(q);
    }
    return seen;
  }, [sorted]);

  const [scope, setScope] = useState<Scope>("month");
  const [monthSel, setMonthSel] = useState(monthKeys[0] ?? "");
  const [quarterSel, setQuarterSel] = useState(quarterKeys[0] ?? "");

  if (sorted.length === 0) return null;

  // Guard against a selection that no longer exists (data changed).
  const activeMonth = monthKeys.includes(monthSel) ? monthSel : monthKeys[0];
  const activeQuarter = quarterKeys.includes(quarterSel) ? quarterSel : quarterKeys[0];

  const visible =
    scope === "all"
      ? sorted
      : scope === "quarter"
      ? sorted.filter((m) => quarterKey(m.monthKey) === activeQuarter)
      : sorted.filter((m) => m.monthKey === activeMonth);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-ink">
          Evaluator comments
          <span className="ml-2 font-normal text-ink-muted">
            {sorted.length} recorded
          </span>
        </h3>
        <div className="flex flex-wrap items-center gap-2">
          {/* Month / Quarter / All segmented control */}
          <div className="flex rounded-lg border border-hairline bg-panel-2 p-0.5 text-sm">
            {(["month", "quarter", "all"] as Scope[]).map((s) => (
              <button
                key={s}
                onClick={() => setScope(s)}
                className={`rounded-md px-3 py-1 capitalize transition-colors ${
                  scope === s
                    ? "bg-accent text-white"
                    : "text-ink-muted hover:text-ink"
                }`}
              >
                {s === "all" ? "All" : s}
              </button>
            ))}
          </div>

          {/* Period picker (only in month/quarter scope) */}
          {scope === "month" && (
            <select
              value={activeMonth}
              onChange={(e) => setMonthSel(e.target.value)}
              className="rounded-lg border border-hairline bg-panel-2 px-3 py-1.5 text-sm text-ink focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
            >
              {monthKeys.map((k) => (
                <option key={k} value={k}>
                  {monthLabel(k)}
                </option>
              ))}
            </select>
          )}
          {scope === "quarter" && (
            <select
              value={activeQuarter}
              onChange={(e) => setQuarterSel(e.target.value)}
              className="rounded-lg border border-hairline bg-panel-2 px-3 py-1.5 text-sm text-ink focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
            >
              {quarterKeys.map((k) => (
                <option key={k} value={k}>
                  {quarterLabel(k)}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="card p-5 text-sm text-ink-muted">
          No evaluator comments for this period.
        </div>
      ) : (
        visible.map((m) => (
          <GrowDisplay
            key={m.monthKey}
            grow={m.grow!}
            title={`Evaluator comments · ${monthLabel(m.monthKey)}`}
            subtitle={`Recorded with the ${m.monthKey} evaluation${
              m.recordedByName ? ` by ${m.recordedByName}` : ""
            }`}
          />
        ))
      )}
    </div>
  );
}
