"use client";

import { useState } from "react";
import { MonthlyEvaluation } from "@/types";
import { resolveChallenge } from "@/lib/employee-actions";

// ============================================================
// What the employee said back about each evaluation — and, for a
// leader, the controls to close out a challenge: uphold the score as
// recorded or mark it revised, always with an explanation that the
// employee sees on their own evaluation.
// ============================================================

export function EmployeeResponses({
  months,
  canResolve,
  onResolved,
}: {
  months: MonthlyEvaluation[];
  canResolve: boolean;
  onResolved: () => void;
}) {
  const responses = [...months]
    .filter((m) => m.ackStatus && m.ackStatus !== "pending")
    .sort((a, b) => b.monthKey.localeCompare(a.monthKey));

  if (responses.length === 0) return null;

  const openChallenges = responses.filter(
    (m) => m.ackStatus === "disputed" && !m.resolution
  ).length;

  return (
    <div className="card p-5">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-ink">Employee responses</h3>
        {openChallenges > 0 && (
          <span className="pill bg-signal-amberbg text-signal-amber">
            {openChallenges} open challenge{openChallenges === 1 ? "" : "s"}
          </span>
        )}
      </div>
      <div className="space-y-2">
        {responses.map((m) => (
          <ResponseRow
            key={m.monthKey}
            evaln={m}
            canResolve={canResolve}
            onResolved={onResolved}
          />
        ))}
      </div>
    </div>
  );
}

function ResponseRow({
  evaln,
  canResolve,
  onResolved,
}: {
  evaln: MonthlyEvaluation;
  canResolve: boolean;
  onResolved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState<"upheld" | "revised" | null>(null);
  const [error, setError] = useState("");

  const challenged = evaln.ackStatus === "disputed";
  const resolved = evaln.resolution;

  const submit = async (outcome: "upheld" | "revised") => {
    setError("");
    if (!comment.trim()) {
      setError("Add a short explanation for the employee.");
      return;
    }
    setBusy(outcome);
    const res = await resolveChallenge({
      departmentId: evaln.departmentId,
      employeeId: evaln.employeeId,
      monthKey: evaln.monthKey,
      outcome,
      comment: comment.trim(),
    });
    setBusy(null);
    if (!res.ok) {
      setError(res.error ?? "Failed to submit.");
      return;
    }
    setOpen(false);
    onResolved();
  };

  return (
    <div className="rounded-lg bg-panel-2 p-3">
      <div className="flex flex-wrap items-start gap-3">
        <span className="text-sm font-medium tabular-nums text-ink">{evaln.monthKey}</span>
        <span
          className={`pill ${
            challenged
              ? "bg-signal-amberbg text-signal-amber"
              : "bg-signal-greenbg text-signal-green"
          }`}
        >
          {challenged ? "Challenged" : "Accepted"}
        </span>
        {evaln.employeeComment && (
          <p className="min-w-[12rem] flex-1 whitespace-pre-wrap text-sm text-ink-muted">
            “{evaln.employeeComment}”
          </p>
        )}
        {challenged && canResolve && !resolved && !open && (
          <button
            onClick={() => setOpen(true)}
            className="ml-auto rounded-lg border border-accent/40 px-3 py-1.5 text-sm font-medium text-accent transition-colors hover:bg-accent/10"
          >
            Respond
          </button>
        )}
      </div>

      {/* Recorded outcome, visible to everyone who can see the row. */}
      {resolved && (
        <div className="mt-2 rounded-md border border-hairline bg-panel p-3">
          <div className="flex items-center gap-2">
            <span
              className={`pill ${
                resolved.outcome === "upheld"
                  ? "bg-panel-2 text-ink-soft"
                  : "bg-accent/15 text-accent"
              }`}
            >
              {resolved.outcome === "upheld" ? "Score upheld" : "Score revised"}
            </span>
            <span className="text-xs text-ink-muted">by {resolved.byName}</span>
          </div>
          <p className="mt-1 whitespace-pre-wrap text-sm text-ink-muted">
            {resolved.comment}
          </p>
        </div>
      )}

      {/* Leader's resolution form. */}
      {open && (
        <div className="mt-3 space-y-2 rounded-md border border-hairline bg-panel p-3">
          <label className="block text-sm font-medium text-ink">
            Your response to this challenge
          </label>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Explain your decision — the employee sees this on their evaluation."
            className="h-20 w-full resize-none rounded-lg border border-hairline bg-panel-2 p-3 text-sm text-ink placeholder:text-ink-muted focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
          />
          <p className="text-xs text-ink-muted">
            Choosing <strong>revised</strong> records that the score was
            corrected — re-enter the month with the Score button to change the
            numbers themselves.
          </p>
          {error && <p className="text-sm text-signal-red">{error}</p>}
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => submit("revised")}
              disabled={!!busy}
              className="btn-primary"
            >
              {busy === "revised" ? "Saving…" : "Score revised"}
            </button>
            <button
              onClick={() => submit("upheld")}
              disabled={!!busy}
              className="rounded-lg border border-hairline px-4 py-2 text-sm font-medium text-ink-soft transition-colors hover:bg-panel-2"
            >
              {busy === "upheld" ? "Saving…" : "Uphold score"}
            </button>
            <button
              onClick={() => {
                setOpen(false);
                setError("");
              }}
              className="btn-ghost"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
