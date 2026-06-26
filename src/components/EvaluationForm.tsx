"use client";

import { useState } from "react";
import { Department, Employee, Metric, MonthlyEvaluation, MonthlyMetricEntry } from "@/types";
import { saveEmployee, newEmployeeId, saveMonthlyEvaluation } from "@/lib/employee-actions";
import { makeMonthKey, MONTH_NAMES } from "@/lib/rollup";
import { fmt } from "@/lib/scoring";

// A form for a manager to add/edit an employee AND record one month's
// evaluation (Phase C). The manager picks the month being evaluated;
// quarterly/yearly are computed from the accumulated months, never typed.
export function EvaluationForm({
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
  const [month, setMonth] = useState(now.getMonth() + 1); // 1-indexed

  // Metric rows seeded from the department template.
  const templateMetrics: Metric[] = dept.metrics.map((m) => ({
    ...m,
    actual: { monthly: 0, quarterly: 0, yearly: 0 },
    score: { monthly: 0, quarterly: 0, yearly: 0 },
  }));

  const [rows, setRows] = useState(
    templateMetrics.map((m) => ({
      metricId: m.id,
      metricName: m.name,
      target: m.target,
      unit: m.unit,
      weight: m.weight,
      actual: 0,
      score: 0,
    }))
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const setRow = (i: number, field: "actual" | "score", value: number) => {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, [field]: value } : r)));
  };

  const handleSave = async () => {
    setError("");
    if (!name.trim()) {
      setError("Employee name is required.");
      return;
    }
    setBusy(true);

    // 1. Ensure the employee record exists (create/update identity).
    const employeeId = existing?.id ?? newEmployeeId(name);
    const employee: Employee = {
      id: employeeId,
      name: name.trim(),
      email: email.trim(),
      departmentId: dept.id,
      role: role.trim() || "—",
      evaluatorName: dept.evaluatorName ?? dept.managerName ?? "",
      type: "kpi",
      metrics: templateMetrics,
    };
    const empResult = await saveEmployee(employee);
    if (!empResult.ok) {
      setBusy(false);
      setError(empResult.error ?? "Failed to save employee.");
      return;
    }

    // 2. Record this month's evaluation as a dated time-series entry.
    const entries: MonthlyMetricEntry[] = rows.map((r) => ({
      metricId: r.metricId,
      metricName: r.metricName,
      target: r.target,
      unit: r.unit,
      weight: r.weight,
      actual: r.actual,
      score: r.score,
    }));
    const evaluation: MonthlyEvaluation = {
      monthKey: makeMonthKey(year, month),
      employeeId,
      departmentId: dept.id,
      entries,
      recordedBy: "",
      recordedByName: "",
      recordedAt: Date.now(),
    };
    const evalResult = await saveMonthlyEvaluation(evaluation);
    setBusy(false);
    if (!evalResult.ok) {
      setError(evalResult.error ?? "Failed to save evaluation.");
      return;
    }
    onSaved();
  };

  const years = [now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1];

  return (
    <div className="card space-y-5 p-6">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-ink">
          {existing ? `Record evaluation · ${existing.name}` : "Add employee & record evaluation"}
        </h3>
        <button onClick={onCancel} className="text-sm text-ink-muted hover:text-ink">
          Cancel
        </button>
      </div>

      {/* Identity */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Field label="Name" value={name} onChange={setName} placeholder="Full name" />
        <Field label="Email" value={email} onChange={setEmail} placeholder="name@stratus.finance" />
        <Field label="Role" value={role} onChange={setRole} placeholder="Job title" />
      </div>

      {/* Month being evaluated */}
      <div className="flex items-end gap-3">
        <div>
          <label className="mb-1 block text-sm font-medium text-ink">Month</label>
          <select
            value={month}
            onChange={(e) => setMonth(Number(e.target.value))}
            className="rounded-lg border border-hairline bg-panel-2 text-ink px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
          >
            {MONTH_NAMES.map((mn, i) => (
              <option key={mn} value={i + 1}>{mn}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-ink">Year</label>
          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="rounded-lg border border-hairline bg-panel-2 text-ink px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
          >
            {years.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
        <p className="pb-2 text-xs text-ink-muted">
          Quarterly & yearly scores are calculated automatically from the months you record.
        </p>
      </div>

      {/* Metric entry */}
      <div className="overflow-hidden rounded-lg border border-hairline">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-hairline bg-panel-2 text-left text-xs uppercase tracking-wide text-ink-muted">
              <th className="px-3 py-2 font-medium">Metric</th>
              <th className="px-3 py-2 text-right font-medium">Target</th>
              <th className="px-3 py-2 text-right font-medium">Actual</th>
              <th className="px-3 py-2 text-right font-medium">Score (0–100)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-hairline">
            {rows.map((r, i) => (
              <tr key={r.metricId}>
                <td className="px-3 py-2 font-medium text-ink">{r.metricName}</td>
                <td className="px-3 py-2 text-right tabular-nums text-ink-muted">
                  {fmt(r.target, 0)} {r.unit}
                </td>
                <td className="px-3 py-2 text-right">
                  <input
                    type="number"
                    value={r.actual || ""}
                    onChange={(e) => setRow(i, "actual", Number(e.target.value))}
                    className="w-24 rounded border border-hairline bg-panel-2 text-ink px-2 py-1 text-right tabular-nums focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/30"
                  />
                </td>
                <td className="px-3 py-2 text-right">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={r.score || ""}
                    onChange={(e) => setRow(i, "score", Number(e.target.value))}
                    className="w-24 rounded border border-hairline bg-panel-2 text-ink px-2 py-1 text-right tabular-nums focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/30"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {error && <p className="text-sm text-signal-red">{error}</p>}

      <div className="flex items-center gap-3">
        <button onClick={handleSave} disabled={busy} className="btn-primary">
          {busy ? "Saving…" : `Save ${MONTH_NAMES[month - 1]} ${year} evaluation`}
        </button>
        <button onClick={onCancel} className="btn-ghost">Cancel</button>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-ink">{label}</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-hairline bg-panel-2 text-ink px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
      />
    </div>
  );
}
