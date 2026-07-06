"use client";

import { useMemo, useState } from "react";
import { Department, Metric } from "@/types";
import { fmt } from "@/lib/scoring";

// ============================================================
// Admin editor for a KPI department's metric template: rename,
// retarget, reweight, flip direction, add or remove metrics.
// Saves through /api/departments, which also propagates the new
// definitions to the department's employee records (their recorded
// scores are preserved by metric id).
// ============================================================

interface Row {
  id: string;
  name: string;
  target: number;
  unit: string;
  weightPct: number; // edited as a percentage, stored as 0–1
  higherIsBetter: boolean;
}

const newId = (deptId: string) =>
  `m_${deptId}_${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36)}`;

export function MetricsEditor({
  dept,
  onSaved,
  onCancel,
}: {
  dept: Department;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [rows, setRows] = useState<Row[]>(() =>
    dept.metrics.map((m) => ({
      id: m.id,
      name: m.name,
      target: m.target,
      unit: m.unit,
      weightPct: Math.round(m.weight * 1000) / 10,
      higherIsBetter: m.higherIsBetter,
    }))
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const totalPct = useMemo(
    () => rows.reduce((s, r) => s + (r.weightPct || 0), 0),
    [rows]
  );
  const weightsOk = Math.abs(totalPct - 100) < 0.51;

  const set = (i: number, patch: Partial<Row>) =>
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  const handleSave = async () => {
    setError("");
    if (rows.length === 0) return setError("A department needs at least one metric.");
    if (rows.some((r) => !r.name.trim())) return setError("Every metric needs a name.");
    setBusy(true);
    try {
      const token = await (
        await import("@/lib/firebase")
      ).auth.currentUser?.getIdToken();
      const metrics: Partial<Metric>[] = rows.map((r) => ({
        id: r.id,
        name: r.name.trim(),
        target: r.target,
        unit: r.unit.trim(),
        weight: (r.weightPct || 0) / 100,
        higherIsBetter: r.higherIsBetter,
      }));
      const res = await fetch("/api/departments", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ departmentId: dept.id, metrics }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed.");
      onSaved();
    } catch (e: any) {
      setError(e.message || "Save failed.");
      setBusy(false);
    }
  };

  return (
    <div className="card animate-reveal-down overflow-hidden p-0">
      <div className="flex items-center justify-between border-b border-hairline bg-panel-2 px-6 py-4">
        <div>
          <h3 className="text-lg font-semibold text-ink">Edit metrics · {dept.name}</h3>
          <p className="mt-0.5 text-sm text-ink-muted">
            Changes apply to the department template and to every employee&apos;s
            scorecard in it — recorded scores are kept.
          </p>
        </div>
        <button onClick={onCancel} className="btn-ghost">
          Cancel
        </button>
      </div>

      <div className="space-y-2.5 p-6">
        {rows.map((r, i) => (
          <div
            key={r.id}
            className="flex flex-wrap items-end gap-3 rounded-xl border border-hairline bg-panel-2/40 p-3.5"
          >
            <div className="min-w-[14rem] flex-1">
              <FieldLabel>Metric</FieldLabel>
              <input
                value={r.name}
                onChange={(e) => set(i, { name: e.target.value })}
                placeholder="Metric name"
                className="w-full rounded-md border border-hairline bg-panel px-2 py-1.5 text-sm text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/30"
              />
            </div>
            <div className="w-24">
              <FieldLabel>Target</FieldLabel>
              <input
                type="number"
                value={r.target}
                onChange={(e) => set(i, { target: Number(e.target.value) })}
                className="w-full rounded-md border border-hairline bg-panel px-2 py-1.5 text-right text-sm tabular-nums text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/30"
              />
            </div>
            <div className="w-20">
              <FieldLabel>Unit</FieldLabel>
              <input
                value={r.unit}
                onChange={(e) => set(i, { unit: e.target.value })}
                placeholder="%"
                className="w-full rounded-md border border-hairline bg-panel px-2 py-1.5 text-sm text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/30"
              />
            </div>
            <div className="w-24">
              <FieldLabel>Weight %</FieldLabel>
              <input
                type="number"
                min={0}
                max={100}
                step={0.5}
                value={r.weightPct}
                onChange={(e) => set(i, { weightPct: Number(e.target.value) })}
                className="w-full rounded-md border border-hairline bg-panel px-2 py-1.5 text-right text-sm tabular-nums text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/30"
              />
            </div>
            <div>
              <FieldLabel>Direction</FieldLabel>
              <button
                type="button"
                onClick={() => set(i, { higherIsBetter: !r.higherIsBetter })}
                className="rounded-md border border-hairline bg-panel px-2.5 py-1.5 text-sm text-ink-soft transition-colors hover:border-accent/40"
              >
                {r.higherIsBetter ? "higher = better" : "lower = better"}
              </button>
            </div>
            <button
              type="button"
              onClick={() => setRows((prev) => prev.filter((_, idx) => idx !== i))}
              aria-label={`Remove ${r.name || "metric"}`}
              className="ml-auto rounded-md border border-transparent px-2.5 py-1.5 text-sm text-signal-red transition-all hover:border-signal-red/40 hover:bg-signal-red/10"
            >
              Remove
            </button>
          </div>
        ))}

        <button
          type="button"
          onClick={() =>
            setRows((prev) => [
              ...prev,
              {
                id: newId(dept.id),
                name: "",
                target: 100,
                unit: "%",
                weightPct: 0,
                higherIsBetter: true,
              },
            ])
          }
          className="btn-ghost"
        >
          + Add metric
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t border-hairline bg-panel-2 px-6 py-4">
        <button onClick={handleSave} disabled={busy} className="btn-primary">
          {busy ? "Saving…" : "Save metrics"}
        </button>
        <span
          className={`text-sm tabular-nums ${
            weightsOk ? "text-signal-green" : "text-signal-amber"
          }`}
        >
          Total weight: {fmt(totalPct, 1)}%
          {!weightsOk && " — scores are normalized, but 100% keeps weights meaningful"}
        </span>
        {error && <p className="text-sm text-signal-red">{error}</p>}
      </div>
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-1 text-[10px] uppercase tracking-wide text-ink-muted">{children}</div>
  );
}
