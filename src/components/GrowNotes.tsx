"use client";

import { GrowComments } from "@/types";

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
