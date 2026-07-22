"use client";

import { useMemo, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db, firebaseReady } from "@/lib/firebase";
import {
  Department,
  Employee,
  Metric,
  Criterion,
  CompetencyCard,
  MonthlyEvaluation,
  MonthlyMetricEntry,
} from "@/types";
import {
  saveEmployee,
  newEmployeeId,
  saveMonthlyEvaluation,
} from "@/lib/employee-actions";
import { makeMonthKey, MONTH_NAMES } from "@/lib/rollup";
import {
  fmt,
  statusFor,
  statusClasses,
  kpiScoreFromActual,
  competencyStatus,
  competencyBand,
} from "@/lib/scoring";
import { LiveScoreDial, StatusPill } from "@/components/ui";
import { GrowInput, emptyGrow, hasGrow, trimGrow } from "@/components/GrowNotes";

// ============================================================
// Score-entry form for leaders (supervisors & admins).
//
// It adapts to the department it's opened from:
//  - KPI departments  → enter each metric's actual for a chosen month;
//    the 0–100 score is auto-derived (with manual override) and the
//    projected overall updates live as you type.
//  - Competency depts → rate each weighted criterion on a 1–5 scale with
//    an interactive pip selector; the weighted overall & band update live.
//
// When `existing` is passed the form seeds from that employee's current
// scorecard so a leader edits in place rather than starting blank.
// ============================================================

export function EvaluationForm(props: {
  dept: Department;
  existing?: Employee;
  onSaved: () => void;
  onCancel: () => void;
}) {
  return props.dept.type === "competency" ? (
    <CompetencyEntry {...props} />
  ) : (
    <KpiEntry {...props} />
  );
}

// ------------------------------------------------------------
// Shared chrome: animated panel + identity fields + live dial.
// ------------------------------------------------------------

function Shell({
  title,
  subtitle,
  onCancel,
  dial,
  children,
  footer,
  saved,
}: {
  title: string;
  subtitle: string;
  onCancel: () => void;
  dial: React.ReactNode;
  children: React.ReactNode;
  footer: React.ReactNode;
  saved: boolean;
}) {
  return (
    <div className="card relative animate-reveal-down overflow-hidden p-0">
      {/* Success sweep */}
      {saved && (
        <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden">
          <div className="absolute inset-y-0 -left-1/3 w-1/3 skew-x-12 animate-sheen bg-gradient-to-r from-transparent via-signal-green/20 to-transparent" />
        </div>
      )}

      <div className="flex flex-col gap-5 border-b border-hairline bg-panel-2 p-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-5">
          <div className="shrink-0">{dial}</div>
          <div>
            <h3 className="text-lg font-semibold text-ink">{title}</h3>
            <p className="mt-0.5 max-w-sm text-sm text-ink-muted">{subtitle}</p>
          </div>
        </div>
        <button
          onClick={onCancel}
          className="self-start rounded-lg border border-hairline px-3 py-1.5 text-sm text-ink-muted transition-colors hover:bg-panel hover:text-ink sm:self-auto"
        >
          Cancel
        </button>
      </div>

      <div className="space-y-5 p-6">{children}</div>

      <div className="flex flex-wrap items-center gap-3 border-t border-hairline bg-panel-2 px-6 py-4">
        {footer}
      </div>
    </div>
  );
}

function Identity({
  name,
  email,
  role,
  setName,
  setEmail,
  setRole,
  locked,
}: {
  name: string;
  email: string;
  role: string;
  setName: (v: string) => void;
  setEmail: (v: string) => void;
  setRole: (v: string) => void;
  locked: boolean;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <Field label="Name" value={name} onChange={setName} placeholder="Full name" disabled={locked} />
      <Field label="Email" value={email} onChange={setEmail} placeholder="name@stratus.finance" disabled={locked} />
      <Field label="Role" value={role} onChange={setRole} placeholder="Job title" disabled={locked} />
    </div>
  );
}

// ------------------------------------------------------------
// KPI entry (0–100, dated monthly time-series).
// ------------------------------------------------------------

interface KpiRow {
  metricId: string;
  metricName: string;
  target: number;
  unit: string;
  weight: number;
  higherIsBetter: boolean;
  actual: number;
  score: number; // manual value, used when auto is off
}

function KpiEntry({
  dept,
  existing,
  onSaved,
  onCancel,
}: {
  dept: Department;
  existing?: Employee;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const now = new Date();
  const [name, setName] = useState(existing?.name ?? "");
  const [email, setEmail] = useState(existing?.email ?? "");
  const [role, setRole] = useState(existing?.role ?? "");
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  // New employees auto-derive scores from actuals; editing an existing one
  // starts from their recorded scores so we don't clobber a manual override.
  const [auto, setAuto] = useState(!existing);
  // GROW commentary is per-month, so each entry starts blank.
  const [grow, setGrow] = useState(emptyGrow());
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const [rows, setRows] = useState<KpiRow[]>(() =>
    dept.metrics.map((m) => {
      const prior = existing?.metrics.find((e) => e.id === m.id);
      return {
        metricId: m.id,
        metricName: m.name,
        target: m.target,
        unit: m.unit,
        weight: m.weight,
        higherIsBetter: m.higherIsBetter,
        actual: prior?.actual.monthly ?? 0,
        score: prior?.score?.monthly ?? 0,
      };
    })
  );

  const effective = (r: KpiRow) =>
    auto ? kpiScoreFromActual(r.actual, r.target, r.higherIsBetter, r.unit) : r.score;

  const totalWeight = useMemo(
    () => rows.reduce((s, r) => s + r.weight, 0) || 1,
    [rows]
  );
  const projected = useMemo(
    () => rows.reduce((s, r) => s + effective(r) * r.weight, 0) / totalWeight,
    [rows, auto, totalWeight]
  );
  const projStatus = statusFor(projected);

  const setRow = (i: number, field: "actual" | "score", value: number) =>
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, [field]: value } : r)));

  const handleSave = async () => {
    setError("");
    if (!name.trim()) return setError("Employee name is required.");
    setBusy(true);

    const employeeId = existing?.id ?? newEmployeeId(name);
    const monthKey = makeMonthKey(year, month);

    // The employee record carries a "current" snapshot shown on rosters.
    // Only refresh it when this save is the newest month on record —
    // back-filling June after August is already saved must not regress
    // the displayed scores to June's numbers.
    let refreshSnapshot = true;
    if (existing && firebaseReady) {
      try {
        const monthsSnap = await getDocs(
          collection(db, "departments", dept.id, "employees", existing.id, "months")
        );
        // monthKeys ("2026-06") sort lexicographically by date.
        refreshSnapshot = !monthsSnap.docs.some((d) => d.id > monthKey);
      } catch {
        // If the check fails, keep the previous always-refresh behavior.
      }
    }

    if (refreshSnapshot) {
      // Snapshot the entered values onto the employee's metric template so
      // the roster & period views reflect the score immediately after saving.
      const metrics: Metric[] = dept.metrics.map((m) => {
        const r = rows.find((x) => x.metricId === m.id)!;
        const sc = effective(r);
        return {
          ...m,
          actual: { monthly: r.actual, quarterly: r.actual, yearly: r.actual },
          score: { monthly: sc, quarterly: sc, yearly: sc },
        };
      });

      const employee: Employee = {
        id: employeeId,
        name: name.trim(),
        email: email.trim(),
        departmentId: dept.id,
        role: role.trim() || "—",
        evaluatorName: dept.evaluatorName ?? dept.managerName ?? "",
        evaluatorUid: existing?.evaluatorUid,
        type: "kpi",
        metrics,
        linkedUid: existing?.linkedUid,
      };
      const empResult = await saveEmployee(employee);
      if (!empResult.ok) {
        setBusy(false);
        return setError(empResult.error ?? "Failed to save employee.");
      }
    }

    const entries: MonthlyMetricEntry[] = rows.map((r) => ({
      metricId: r.metricId,
      metricName: r.metricName,
      target: r.target,
      unit: r.unit,
      weight: r.weight,
      actual: r.actual,
      score: effective(r),
    }));
    const evaluation: MonthlyEvaluation = {
      monthKey,
      employeeId,
      departmentId: dept.id,
      entries,
      recordedBy: "",
      recordedByName: "",
      recordedAt: Date.now(),
      ...(hasGrow(grow) ? { grow: trimGrow(grow) } : {}),
    };
    const evalResult = await saveMonthlyEvaluation(evaluation);
    setBusy(false);
    if (!evalResult.ok) return setError(evalResult.error ?? "Failed to save evaluation.");

    setSaved(true);
    setTimeout(onSaved, 750);
  };

  const years = [now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1];

  return (
    <Shell
      saved={saved}
      title={existing ? `Score · ${existing.name}` : "Score a new employee"}
      subtitle={`${dept.name} scorecard · enter this month's actuals and the projected score updates live.`}
      onCancel={onCancel}
      dial={<LiveScoreDial value={projected} status={projStatus} />}
      footer={
        <>
          <button onClick={handleSave} disabled={busy || saved} className="btn-primary">
            {saved
              ? "Saved ✓"
              : busy
              ? "Saving…"
              : `Save ${MONTH_NAMES[month - 1]} ${year}`}
          </button>
          <button onClick={onCancel} className="btn-ghost">
            Cancel
          </button>
          {error && <p className="text-sm text-signal-red">{error}</p>}
        </>
      }
    >
      <Identity
        name={name}
        email={email}
        role={role}
        setName={setName}
        setEmail={setEmail}
        setRole={setRole}
        locked={!!existing}
      />

      {/* Period + auto-score toggle */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex items-end gap-3">
          <Select label="Month" value={month} onChange={setMonth}>
            {MONTH_NAMES.map((mn, i) => (
              <option key={mn} value={i + 1}>
                {mn}
              </option>
            ))}
          </Select>
          <Select label="Year" value={year} onChange={setYear}>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </Select>
        </div>
        <Toggle
          on={auto}
          onChange={setAuto}
          label="Auto-score from actuals"
          hint={auto ? "Scores computed vs target" : "Manual score entry"}
        />
      </div>

      {/* Metric rows */}
      <div className="stagger space-y-2.5">
        {rows.map((r, i) => {
          const sc = effective(r);
          const st = statusFor(sc);
          const c = statusClasses(st);
          return (
            <div
              key={r.metricId}
              className="rounded-xl border border-hairline bg-panel-2/40 p-3.5 transition-colors hover:border-accent/40"
            >
              <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
                <div className="min-w-[9rem] flex-1">
                  <div className="font-medium text-ink">{r.metricName}</div>
                  <div className="mt-0.5 flex items-center gap-2 text-xs text-ink-muted">
                    <span>
                      Target {fmt(r.target, 0)} {r.unit}
                    </span>
                    <span className="text-hairline">·</span>
                    <span>{fmt(r.weight * 100, 0)}% weight</span>
                    <span className="text-hairline">·</span>
                    <span>{r.higherIsBetter ? "higher = better" : "lower = better"}</span>
                  </div>
                </div>

                <LabeledInput
                  label="Actual"
                  value={r.actual}
                  onChange={(v) => setRow(i, "actual", v)}
                />

                <div className="w-24">
                  <div className="mb-1 text-[10px] uppercase tracking-wide text-ink-muted">
                    Score
                  </div>
                  {auto ? (
                    <div
                      className={`flex h-[34px] items-center justify-end rounded-md border border-hairline bg-panel px-2 tabular-nums ${c.text}`}
                    >
                      {fmt(sc, 0)}
                    </div>
                  ) : (
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={r.score || ""}
                      onChange={(e) => setRow(i, "score", Number(e.target.value))}
                      className="h-[34px] w-full rounded-md border border-hairline bg-panel px-2 text-right tabular-nums text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/30"
                    />
                  )}
                </div>

                <div className="flex w-32 items-center gap-2">
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-panel">
                    <div
                      className={`h-full rounded-full ${c.dot} transition-all duration-500 ease-out`}
                      style={{ width: `${Math.min(100, sc)}%` }}
                    />
                  </div>
                  <span className={`h-2 w-2 shrink-0 rounded-full ${c.dot}`} />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <GrowInput value={grow} onChange={setGrow} />

      <p className="text-xs text-ink-muted">
        Quarterly & yearly scores are calculated automatically from the months
        you record — you only enter one month at a time.
      </p>
    </Shell>
  );
}

// ------------------------------------------------------------
// Competency entry (1–5 weighted criteria, single review).
// ------------------------------------------------------------

function CompetencyEntry({
  dept,
  existing,
  onSaved,
  onCancel,
}: {
  dept: Department;
  existing?: Employee;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const template = dept.competency;
  const [name, setName] = useState(existing?.name ?? "");
  const [email, setEmail] = useState(existing?.email ?? "");
  const [role, setRole] = useState(existing?.role ?? "");
  const [grow, setGrow] = useState(existing?.competency?.grow ?? emptyGrow());
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const [criteria, setCriteria] = useState<Criterion[]>(() => {
    const base = template?.criteria ?? existing?.competency?.criteria ?? [];
    return base.map((crit) => {
      const prior = existing?.competency?.criteria.find((p) => p.id === crit.id);
      const score = prior?.score ?? 0;
      return { ...crit, score, weighted: crit.weight * score };
    });
  });

  const overall = useMemo(
    () => criteria.reduce((s, c) => s + c.weight * c.score, 0),
    [criteria]
  );
  const status = competencyStatus(overall || 0);
  const band = competencyBand(overall || 0);

  const setScore = (id: string, score: number) =>
    setCriteria((prev) =>
      prev.map((c) => (c.id === id ? { ...c, score, weighted: c.weight * score } : c))
    );

  // Group by section, preserving order.
  const sections = useMemo(() => {
    const out: { name: string; items: Criterion[] }[] = [];
    for (const crit of criteria) {
      let sec = out.find((s) => s.name === (crit.section || "Other"));
      if (!sec) {
        sec = { name: crit.section || "Other", items: [] };
        out.push(sec);
      }
      sec.items.push(crit);
    }
    return out;
  }, [criteria]);

  const handleSave = async () => {
    setError("");
    if (!name.trim()) return setError("Employee name is required.");
    if (criteria.some((c) => c.score === 0))
      return setError("Rate every criterion (1–5) before saving.");
    setBusy(true);

    const card: CompetencyCard = {
      criteria: criteria.map((c) => ({ ...c, weighted: c.weight * c.score })),
      overall,
      band,
      ...(hasGrow(grow) ? { grow: trimGrow(grow) } : {}),
    };
    const employee: Employee = {
      id: existing?.id ?? newEmployeeId(name),
      name: name.trim(),
      email: email.trim(),
      departmentId: dept.id,
      role: role.trim() || "—",
      evaluatorName: dept.evaluatorName ?? dept.managerName ?? "",
      evaluatorUid: existing?.evaluatorUid,
      type: "competency",
      metrics: existing?.metrics ?? [],
      competency: card,
      linkedUid: existing?.linkedUid,
    };
    const res = await saveEmployee(employee);
    setBusy(false);
    if (!res.ok) return setError(res.error ?? "Failed to save review.");
    setSaved(true);
    setTimeout(onSaved, 750);
  };

  if (!template && !existing?.competency) {
    return (
      <div className="card p-6 text-sm text-ink-muted">
        This competency department has no criteria template to rate against yet.
        An admin can define one with the <span className="font-medium text-ink">Edit criteria</span>{" "}
        button on the department page (or load it via Excel Sync).
      </div>
    );
  }

  return (
    <Shell
      saved={saved}
      title={existing ? `Review · ${existing.name}` : "Review a new employee"}
      subtitle={`${dept.name} competency review · rate each criterion 1–5 and the weighted overall updates live.`}
      onCancel={onCancel}
      dial={
        <LiveScoreDial
          value={overall}
          status={status}
          max={5}
          digits={2}
          caption="of 5.00"
        />
      }
      footer={
        <>
          <button onClick={handleSave} disabled={busy || saved} className="btn-primary">
            {saved ? "Saved ✓" : busy ? "Saving…" : "Save review"}
          </button>
          <button onClick={onCancel} className="btn-ghost">
            Cancel
          </button>
          {band && !error && (
            <span className={`pill ${statusClasses(status).bg} ${statusClasses(status).text}`}>
              {band}
            </span>
          )}
          {error && <p className="text-sm text-signal-red">{error}</p>}
        </>
      }
    >
      <Identity
        name={name}
        email={email}
        role={role}
        setName={setName}
        setEmail={setEmail}
        setRole={setRole}
        locked={!!existing}
      />

      <div className="stagger space-y-4">
        {sections.map((sec) => (
          <div key={sec.name} className="overflow-hidden rounded-xl border border-hairline">
            <div className="border-b border-hairline bg-panel-2 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-ink-soft">
              {sec.name}
            </div>
            <div className="divide-y divide-hairline">
              {sec.items.map((crit) => (
                <div key={crit.id} className="flex flex-wrap items-center gap-x-4 gap-y-3 p-3.5">
                  <div className="min-w-[10rem] flex-1">
                    <div className="font-medium text-ink">
                      <span className="text-ink-muted">{crit.number}. </span>
                      {crit.name}
                    </div>
                    {crit.descriptor && (
                      <div className="mt-0.5 text-xs text-ink-muted">{crit.descriptor}</div>
                    )}
                    <div className="mt-0.5 text-xs text-ink-muted">
                      {fmt(crit.weight * 100, 0)}% weight
                    </div>
                  </div>
                  <PipSelector value={crit.score} onChange={(v) => setScore(crit.id, v)} />
                  <div className="w-16 text-right text-sm tabular-nums text-ink-muted">
                    {crit.score ? fmt(crit.weight * crit.score, 2) : "—"}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <GrowInput value={grow} onChange={setGrow} />
    </Shell>
  );
}

// ------------------------------------------------------------
// Small building blocks.
// ------------------------------------------------------------

// Interactive 1–5 rating: click a pip to set the score, with a soft pop.
function PipSelector({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  const [hover, setHover] = useState(0);
  const active = hover || value;
  return (
    <div className="flex items-center gap-1.5" onMouseLeave={() => setHover(0)}>
      {[1, 2, 3, 4, 5].map((n) => {
        const filled = n <= active;
        return (
          <button
            key={n}
            type="button"
            aria-label={`Rate ${n} of 5`}
            onMouseEnter={() => setHover(n)}
            onClick={() => onChange(n)}
            className={`grid h-8 w-8 place-items-center rounded-lg border text-sm font-semibold tabular-nums transition-all duration-150 ${
              filled
                ? "border-accent bg-accent/15 text-accent"
                : "border-hairline bg-panel text-ink-muted hover:border-accent/40"
            } ${n === value ? "animate-pop" : ""}`}
          >
            {n}
          </button>
        );
      })}
    </div>
  );
}

function Toggle({
  on,
  onChange,
  label,
  hint,
}: {
  on: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      className="group flex items-center gap-3 text-left"
    >
      <span
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors duration-200 ${
          on ? "bg-accent" : "bg-hairline"
        }`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-all duration-200 ${
            on ? "left-[22px]" : "left-0.5"
          }`}
        />
      </span>
      <span className="leading-tight">
        <span className="block text-sm font-medium text-ink">{label}</span>
        {hint && <span className="block text-xs text-ink-muted">{hint}</span>}
      </span>
    </button>
  );
}

function LabeledInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="w-24">
      <div className="mb-1 text-[10px] uppercase tracking-wide text-ink-muted">{label}</div>
      <input
        type="number"
        value={value || ""}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-[34px] w-full rounded-md border border-hairline bg-panel px-2 text-right tabular-nums text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/30"
      />
    </div>
  );
}

function Select({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-ink">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="rounded-lg border border-hairline bg-panel-2 px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
      >
        {children}
      </select>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-ink">{label}</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className="w-full rounded-lg border border-hairline bg-panel-2 px-3 py-2 text-sm text-ink placeholder:text-ink-muted focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20 disabled:opacity-60"
      />
    </div>
  );
}
