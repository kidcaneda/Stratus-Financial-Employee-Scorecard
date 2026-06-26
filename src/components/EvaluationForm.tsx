"use client";

import { useState } from "react";
import { Department, Employee, Metric, Period } from "@/types";
import { saveEmployee, newEmployeeId } from "@/lib/employee-actions";
import { fmt } from "@/lib/scoring";

// A form for a manager to add a new employee to a department and enter
// their evaluation scores. Mirrors the department's KPI metric template.
// (Competency-type departments are handled in a later iteration.)
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
  const [name, setName] = useState(existing?.name ?? "");
  const [email, setEmail] = useState(existing?.email ?? "");
  const [role, setRole] = useState(existing?.role ?? "");
  const [period, setPeriod] = useState<Period>("monthly");

  // Seed metric rows from the employee (if editing) or the dept template.
  const templateMetrics: Metric[] =
    existing?.metrics?.length
      ? existing.metrics
      : dept.metrics.map((m) => ({
          ...m,
          actual: { monthly: 0, quarterly: 0, yearly: 0 },
          score: { monthly: 0, quarterly: 0, yearly: 0 },
        }));

  const [metrics, setMetrics] = useState<Metric[]>(templateMetrics);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const setScore = (idx: number, value: number) => {
    setMetrics((prev) =>
      prev.map((m, i) =>
        i === idx
          ? { ...m, score: { ...(m.score ?? { monthly: 0, quarterly: 0, yearly: 0 }), [period]: value } }
          : m
      )
    );
  };
  const setActual = (idx: number, value: number) => {
    setMetrics((prev) =>
      prev.map((m, i) =>
        i === idx ? { ...m, actual: { ...m.actual, [period]: value } } : m
      )
    );
  };

  const handleSave = async () => {
    setError("");
    if (!name.trim()) {
      setError("Employee name is required.");
      return;
    }
    setBusy(true);
    const employee: Employee = {
      id: existing?.id ?? newEmployeeId(name),
      name: name.trim(),
      email: email.trim(),
      departmentId: dept.id,
      role: role.trim() || "—",
      evaluatorName: dept.evaluatorName ?? dept.managerName ?? "",
      type: "kpi",
      metrics,
    };
    const result = await saveEmployee(employee);
    setBusy(false);
    if (!result.ok) {
      setError(result.error ?? "Save failed.");
      return;
    }
    onSaved();
  };

  const periods: Period[] = ["monthly", "quarterly", "yearly"];

  return (
    <div className="card space-y-5 p-6">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-ink">
          {existing ? "Edit evaluation" : "Add employee & evaluation"}
        </h3>
        <button onClick={onCancel} className="text-sm text-ink-muted hover:text-ink">
          Cancel
        </button>
      </div>

      {/* Identity fields */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Field label="Name" value={name} onChange={setName} placeholder="Full name" />
        <Field label="Email" value={email} onChange={setEmail} placeholder="name@stratus.finance" />
        <Field label="Role" value={role} onChange={setRole} placeholder="Job title" />
      </div>

      {/* Period selector for which period's scores you're entering */}
      <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5">
        {periods.map((p) => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium capitalize transition ${
              period === p ? "bg-ink text-white" : "text-ink-muted hover:text-ink"
            }`}
          >
            {p}
          </button>
        ))}
      </div>

      {/* Metric entry table */}
      <div className="overflow-hidden rounded-lg border border-slate-200">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-paper text-left text-xs uppercase tracking-wide text-ink-muted">
              <th className="px-3 py-2 font-medium">Metric</th>
              <th className="px-3 py-2 text-right font-medium">Target</th>
              <th className="px-3 py-2 text-right font-medium">Actual</th>
              <th className="px-3 py-2 text-right font-medium">Score (0–100)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {metrics.map((m, i) => (
              <tr key={m.id}>
                <td className="px-3 py-2 font-medium text-ink">{m.name}</td>
                <td className="px-3 py-2 text-right tabular-nums text-ink-muted">
                  {fmt(m.target, 0)} {m.unit}
                </td>
                <td className="px-3 py-2 text-right">
                  <input
                    type="number"
                    value={m.actual[period] || ""}
                    onChange={(e) => setActual(i, Number(e.target.value))}
                    className="w-24 rounded border border-slate-200 px-2 py-1 text-right tabular-nums focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/30"
                  />
                </td>
                <td className="px-3 py-2 text-right">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={m.score?.[period] || ""}
                    onChange={(e) => setScore(i, Number(e.target.value))}
                    className="w-24 rounded border border-slate-200 px-2 py-1 text-right tabular-nums focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/30"
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
          {busy ? "Saving…" : existing ? "Save changes" : "Add employee"}
        </button>
        <button onClick={onCancel} className="btn-ghost">
          Cancel
        </button>
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
        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
      />
    </div>
  );
}
