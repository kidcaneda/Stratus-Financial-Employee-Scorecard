"use client";

import { useMemo, useState } from "react";
import { Department } from "@/types";
import { fmt } from "@/lib/scoring";

// ============================================================
// Admin editor for a competency department's 1–5 criteria template:
// rename, reweight, regroup into sections, edit descriptors, add or
// remove criteria. Saves through /api/departments (criteria branch),
// which rebuilds every employee's competency card — recorded ratings
// are preserved by criterion id. Also the way to CREATE the template
// when a department has none (the review form needs one to open).
// ============================================================

interface Row {
  id: string;
  section: string;
  name: string;
  descriptor: string;
  weightPct: number; // edited as a percentage, stored as 0–1
}

const newId = (deptId: string) =>
  `c_${deptId}_${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36)}`;

export function CriteriaEditor({
  dept,
  onSaved,
  onCancel,
}: {
  dept: Department;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [rows, setRows] = useState<Row[]>(() =>
    (dept.competency?.criteria ?? []).map((c) => ({
      id: c.id,
      section: c.section,
      name: c.name,
      descriptor: c.descriptor,
      weightPct: Math.round(c.weight * 1000) / 10,
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

  const addRow = () =>
    setRows((prev) => [
      ...prev,
      {
        id: newId(dept.id),
        section: prev[prev.length - 1]?.section ?? "",
        name: "",
        descriptor: "",
        weightPct: 0,
      },
    ]);

  const handleSave = async () => {
    setError("");
    if (rows.length === 0) return setError("Add at least one criterion.");
    if (rows.some((r) => !r.name.trim())) return setError("Every criterion needs a name.");
    setBusy(true);
    try {
      const token = await (
        await import("@/lib/firebase")
      ).auth.currentUser?.getIdToken();
      const criteria = rows.map((r, i) => ({
        id: r.id,
        number: String(i + 1),
        name: r.name.trim(),
        descriptor: r.descriptor.trim(),
        section: r.section.trim(),
        weight: (r.weightPct || 0) / 100,
        score: 0,
        weighted: 0,
        comments: "",
      }));
      const res = await fetch("/api/departments", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ departmentId: dept.id, criteria }),
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
          <h3 className="text-lg font-semibold text-ink">Edit criteria · {dept.name}</h3>
          <p className="mt-0.5 text-sm text-ink-muted">
            The 1–5 review template. Changes apply to every employee&apos;s review
            card in this department — recorded ratings are kept.
          </p>
        </div>
        <button onClick={onCancel} className="btn-ghost">
          Cancel
        </button>
      </div>

      <div className="space-y-2.5 p-6">
        {rows.length === 0 && (
          <p className="text-sm text-ink-muted">
            No criteria yet — this is why the review form can&apos;t open. Add the
            criteria below (e.g. sections like &quot;Operational Performance&quot;,
            &quot;Behavioral&quot;, &quot;Goals&quot;) and save.
          </p>
        )}
        {rows.map((r, i) => (
          <div
            key={r.id}
            className="flex flex-wrap items-end gap-3 rounded-xl border border-hairline bg-panel-2/40 p-3.5"
          >
            <div className="w-6 pb-1.5 text-right text-sm tabular-nums text-ink-muted">
              {i + 1}
            </div>
            <div className="w-40">
              <FieldLabel>Section</FieldLabel>
              <input
                value={r.section}
                onChange={(e) => set(i, { section: e.target.value })}
                placeholder="Operational Performance"
                className="w-full rounded-md border border-hairline bg-panel px-2 py-1.5 text-sm text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/30"
              />
            </div>
            <div className="min-w-[12rem] flex-1">
              <FieldLabel>Criterion</FieldLabel>
              <input
                value={r.name}
                onChange={(e) => set(i, { name: e.target.value })}
                placeholder="Criterion name"
                className="w-full rounded-md border border-hairline bg-panel px-2 py-1.5 text-sm text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/30"
              />
            </div>
            <div className="min-w-[14rem] flex-[1.4]">
              <FieldLabel>What &quot;good&quot; looks like</FieldLabel>
              <input
                value={r.descriptor}
                onChange={(e) => set(i, { descriptor: e.target.value })}
                placeholder="Optional descriptor shown under the criterion"
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
            <button
              type="button"
              onClick={() => setRows((prev) => prev.filter((_, idx) => idx !== i))}
              aria-label={`Remove ${r.name || "criterion"}`}
              className="ml-auto rounded-md border border-transparent px-2.5 py-1.5 text-sm text-signal-red transition-all hover:border-signal-red/40 hover:bg-signal-red/10"
            >
              Remove
            </button>
          </div>
        ))}

        <button type="button" onClick={addRow} className="btn-ghost">
          + Add criterion
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t border-hairline bg-panel-2 px-6 py-4">
        <button onClick={handleSave} disabled={busy} className="btn-primary">
          {busy ? "Saving…" : "Save criteria"}
        </button>
        <span
          className={`text-sm tabular-nums ${
            weightsOk ? "text-signal-green" : "text-signal-amber"
          }`}
        >
          Total weight: {fmt(totalPct, 1)}%
          {!weightsOk && " — the overall is out of 5.00 only when weights sum to 100%"}
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
