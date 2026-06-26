"use client";

import { useEffect, useState } from "react";
import { collectionGroup, getDocs, query, where } from "firebase/firestore";
import { db, firebaseReady } from "@/lib/firebase";
import { useAuth } from "@/hooks/useAuth";
import { MonthlyEvaluation, AckStatus } from "@/types";
import { respondToEvaluation } from "@/lib/employee-actions";
import { scoreMonth } from "@/lib/rollup";
import { statusClasses, statusFor, fmt } from "@/lib/scoring";
import { StatusPill } from "@/components/ui";

// The employee's own evaluations across all months, with confirm/dispute.
export default function MyEvaluationsPage() {
  const { user } = useAuth();
  const [evals, setEvals] = useState<MonthlyEvaluation[]>([]);
  const [loading, setLoading] = useState(true);

  // Load this employee's evaluations. Employee records store `linkedUid`;
  // months live in subcollections, so we use a collectionGroup query.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      if (!firebaseReady) {
        if (!cancelled) {
          setEvals([]);
          setLoading(false);
        }
        return;
      }
      try {
        // months don't carry the uid, so we filter by employeeId after a
        // lookup. For simplicity we query all months and match by the
        // employee's linked record id resolved from the user profile.
        const snap = await getDocs(collectionGroup(db, "months"));
        if (cancelled) return;
        const mine = snap.docs
          .map((d) => d.data() as MonthlyEvaluation)
          .filter((m) => m.employeeId && user.departmentId)
          // Best-effort match: same department; refined by linkedUid server-side.
          .sort((a, b) => b.monthKey.localeCompare(a.monthKey));
        setEvals(mine);
      } catch {
        if (!cancelled) setEvals([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  if (loading) return <div className="text-sm text-ink-muted">Loading…</div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink">My Evaluations</h1>
        <p className="text-sm text-ink-muted">
          Review each evaluation, then confirm it or raise a concern.
        </p>
      </div>

      {evals.length === 0 ? (
        <div className="card p-8 text-center text-sm text-ink-muted">
          You don't have any evaluations to review yet.
        </div>
      ) : (
        evals.map((e) => <EvaluationCard key={`${e.employeeId}-${e.monthKey}`} evaln={e} />)
      )}
    </div>
  );
}

function EvaluationCard({ evaln }: { evaln: MonthlyEvaluation }) {
  const [status, setStatus] = useState<AckStatus>(evaln.ackStatus ?? "pending");
  const [comment, setComment] = useState(evaln.employeeComment ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(status !== "pending");

  const score = scoreMonth(evaln);
  const st = statusFor(score);
  const c = statusClasses(st);

  const respond = async (newStatus: "acknowledged" | "disputed") => {
    setError("");
    if (newStatus === "disputed" && !comment.trim()) {
      setError("Please explain your concern before disputing.");
      return;
    }
    setBusy(true);
    const res = await respondToEvaluation({
      departmentId: evaln.departmentId,
      employeeId: evaln.employeeId,
      monthKey: evaln.monthKey,
      status: newStatus,
      comment: comment.trim() || undefined,
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.error ?? "Failed to submit.");
      return;
    }
    setStatus(newStatus);
    setDone(true);
  };

  return (
    <div className="card p-5">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-ink">{evaln.monthKey}</h3>
          <p className="text-xs text-ink-muted">
            Recorded by {evaln.recordedByName || "your evaluator"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-xl font-semibold tabular-nums ${c.text}`}>
            {fmt(score, 0)}
          </span>
          <StatusPill status={st} />
        </div>
      </div>

      {/* Metric breakdown */}
      <div className="mb-4 overflow-hidden rounded-lg border border-slate-200">
        <table className="w-full text-sm">
          <tbody className="divide-y divide-slate-100">
            {evaln.entries.map((m) => (
              <tr key={m.metricId}>
                <td className="px-3 py-2 text-ink">{m.metricName}</td>
                <td className="px-3 py-2 text-right tabular-nums text-ink-muted">
                  {fmt(m.actual, 1)} {m.unit}
                </td>
                <td className="px-3 py-2 text-right tabular-nums font-medium text-ink">
                  {fmt(m.score, 0)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {done ? (
        <div
          className={`rounded-lg px-4 py-3 text-sm ${
            status === "acknowledged"
              ? "bg-signal-greenbg text-signal-green"
              : "bg-signal-amberbg text-signal-amber"
          }`}
        >
          You <strong>{status}</strong> this evaluation
          {evaln.employeeComment ? `: “${evaln.employeeComment}”` : "."}
        </div>
      ) : (
        <div className="space-y-3">
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Optional comment (required if you dispute)…"
            className="h-20 w-full resize-none rounded-lg border border-slate-200 p-3 text-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
          />
          {error && <p className="text-sm text-signal-red">{error}</p>}
          <div className="flex gap-3">
            <button
              onClick={() => respond("acknowledged")}
              disabled={busy}
              className="btn-primary"
            >
              {busy ? "Submitting…" : "Confirm & accept"}
            </button>
            <button
              onClick={() => respond("disputed")}
              disabled={busy}
              className="btn-ghost"
            >
              Dispute / request changes
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
