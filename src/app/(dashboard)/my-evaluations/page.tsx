"use client";

import { useEffect, useState } from "react";
import { collection, collectionGroup, getDocs } from "firebase/firestore";
import { db, firebaseReady } from "@/lib/firebase";
import { useAuth } from "@/hooks/useAuth";
import { Employee, MonthlyEvaluation, AckStatus } from "@/types";
import { respondToEvaluation } from "@/lib/employee-actions";
import { scoreMonth } from "@/lib/rollup";
import { statusClasses, statusFor, fmt } from "@/lib/scoring";
import { StatusPill } from "@/components/ui";
import { GROW_FIELDS, hasGrow } from "@/components/GrowNotes";

// ============================================================
// My Evaluations — the employee's own evaluations, where they can
// accept the score, challenge it, and leave a comment either way.
//
// Only the signed-in person's own records are loaded: we first find the
// employee record(s) linked to this account (by linkedUid, falling back
// to a company-email match), then read only those months subcollections.
// ============================================================

export default function MyEvaluationsPage() {
  const { user, loading: authLoading } = useAuth();
  const [evals, setEvals] = useState<MonthlyEvaluation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    let cancelled = false;

    (async () => {
      setLoading(true);
      if (!firebaseReady || !user) {
        if (!cancelled) {
          setEvals([]);
          setLoading(false);
        }
        return;
      }
      try {
        // 1. Which employee record(s) are me?
        const empSnap = await getDocs(collectionGroup(db, "employees"));
        const email = (user.email || "").toLowerCase();
        const mine = empSnap.docs
          .map((d) => d.data() as Employee)
          .filter(
            (e) =>
              (e.linkedUid && e.linkedUid === user.uid) ||
              (!!email && (e.email || "").toLowerCase() === email)
          );

        // 2. Read only my own months.
        const monthLists = await Promise.all(
          mine.map((e) =>
            getDocs(
              collection(db, "departments", e.departmentId, "employees", e.id, "months")
            ).then(
              (s) => s.docs.map((d) => d.data() as MonthlyEvaluation),
              () => [] as MonthlyEvaluation[]
            )
          )
        );
        if (cancelled) return;
        setEvals(
          monthLists.flat().sort((a, b) => b.monthKey.localeCompare(a.monthKey))
        );
      } catch {
        if (!cancelled) setEvals([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user, authLoading]);

  if (loading) return <div className="text-sm text-ink-muted">Loading…</div>;

  const pending = evals.filter((e) => (e.ackStatus ?? "pending") === "pending").length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink">My Evaluations</h1>
        <p className="text-sm text-ink-muted">
          Review each evaluation, then accept it or challenge it — you can leave
          a comment either way.
          {pending > 0 && (
            <span className="ml-1 text-signal-amber">
              {pending} awaiting your response.
            </span>
          )}
        </p>
      </div>

      {evals.length === 0 ? (
        <div className="card p-8 text-center text-sm text-ink-muted">
          You don&apos;t have any evaluations to review yet.
        </div>
      ) : (
        evals.map((e) => (
          <EvaluationCard key={`${e.departmentId}-${e.employeeId}-${e.monthKey}`} evaln={e} />
        ))
      )}
    </div>
  );
}

function EvaluationCard({ evaln }: { evaln: MonthlyEvaluation }) {
  const [status, setStatus] = useState<AckStatus>(evaln.ackStatus ?? "pending");
  const [comment, setComment] = useState(evaln.employeeComment ?? "");
  const [savedComment, setSavedComment] = useState(evaln.employeeComment ?? "");
  const [busy, setBusy] = useState<"acknowledged" | "disputed" | null>(null);
  const [error, setError] = useState("");
  const [done, setDone] = useState((evaln.ackStatus ?? "pending") !== "pending");

  const score = scoreMonth(evaln);
  const st = statusFor(score);
  const c = statusClasses(st);

  const respond = async (newStatus: "acknowledged" | "disputed") => {
    setError("");
    // A challenge must explain itself; accepting a score may stand alone.
    if (newStatus === "disputed" && !comment.trim()) {
      setError("Please explain what you're challenging before submitting.");
      return;
    }
    setBusy(newStatus);
    const res = await respondToEvaluation({
      departmentId: evaln.departmentId,
      employeeId: evaln.employeeId,
      monthKey: evaln.monthKey,
      status: newStatus,
      comment: comment.trim() || undefined,
    });
    setBusy(null);
    if (!res.ok) {
      setError(res.error ?? "Failed to submit.");
      return;
    }
    setStatus(newStatus);
    setSavedComment(comment.trim());
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
      <div className="mb-4 overflow-hidden rounded-lg border border-hairline">
        <table className="w-full text-sm">
          <tbody className="divide-y divide-hairline">
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

      {/* Evaluator's GROW commentary recorded with this month. */}
      {hasGrow(evaln.grow) && (
        <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {GROW_FIELDS.filter((f) => (evaln.grow![f.key] ?? "").trim() !== "").map((f) => (
            <div key={f.key} className="rounded-lg bg-panel-2 p-3">
              <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-soft">
                {f.label}
              </div>
              <p className="whitespace-pre-wrap text-sm text-ink-muted">
                {evaln.grow![f.key]}
              </p>
            </div>
          ))}
        </div>
      )}

      {done ? (
        <div
          className={`rounded-lg px-4 py-3 text-sm ${
            status === "acknowledged"
              ? "bg-signal-greenbg text-signal-green"
              : "bg-signal-amberbg text-signal-amber"
          }`}
        >
          <div>
            You <strong>{status === "acknowledged" ? "accepted" : "challenged"}</strong>{" "}
            this evaluation.
          </div>
          {savedComment && (
            <p className="mt-1 whitespace-pre-wrap text-ink-muted">“{savedComment}”</p>
          )}
          <button
            onClick={() => {
              setDone(false);
              setError("");
            }}
            className="mt-2 text-xs underline opacity-80 hover:opacity-100"
          >
            Change my response
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <label className="block text-sm font-medium text-ink">
            Your comment
            <span className="ml-1 font-normal text-ink-muted">
              (optional when accepting, required when challenging)
            </span>
          </label>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Share your perspective on this evaluation…"
            className="h-24 w-full resize-none rounded-lg border border-hairline bg-panel-2 p-3 text-sm text-ink placeholder:text-ink-muted focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
          />
          {error && <p className="text-sm text-signal-red">{error}</p>}
          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => respond("acknowledged")}
              disabled={!!busy}
              className="btn-primary"
            >
              {busy === "acknowledged" ? "Submitting…" : "Accept evaluation"}
            </button>
            <button
              onClick={() => respond("disputed")}
              disabled={!!busy}
              className="rounded-lg border border-signal-amber/40 px-4 py-2 text-sm font-medium text-signal-amber transition-colors hover:bg-signal-amber/10"
            >
              {busy === "disputed" ? "Submitting…" : "Challenge evaluation"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
