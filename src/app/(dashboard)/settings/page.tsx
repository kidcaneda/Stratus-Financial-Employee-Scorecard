"use client";

import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { DEFAULT_THRESHOLDS } from "@/types";

export default function SettingsPage() {
  const { user } = useAuth();
  const [green, setGreen] = useState(DEFAULT_THRESHOLDS.green);
  const [amber, setAmber] = useState(DEFAULT_THRESHOLDS.amber);
  const [saved, setSaved] = useState(false);

  if (user && user.role !== "admin") {
    return (
      <div className="card p-6">
        <h1 className="text-lg font-semibold text-ink">Restricted</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Settings are available to administrators only.
        </p>
      </div>
    );
  }

  const valid = green > amber && amber > 0 && green <= 100;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink">Settings</h1>
        <p className="text-sm text-ink-muted">Scoring thresholds and access roles</p>
      </div>

      <div className="card space-y-4 p-6">
        <h2 className="text-base font-semibold text-ink">Score thresholds</h2>
        <p className="text-sm text-ink-muted">
          Scores at or above each cutoff take that color. Below amber is red.
        </p>
        <div className="grid grid-cols-2 gap-4 sm:max-w-md">
          <ThresholdInput label="Green ≥" value={green} onChange={setGreen} color="text-signal-green" />
          <ThresholdInput label="Amber ≥" value={amber} onChange={setAmber} color="text-signal-amber" />
        </div>
        {!valid && (
          <p className="text-sm text-signal-red">
            Green must be higher than amber, and both within 1–100.
          </p>
        )}
        <button
          disabled={!valid}
          onClick={() => {
            setSaved(true);
            setTimeout(() => setSaved(false), 2000);
            // In production: write to Firestore config/thresholds via Admin route.
          }}
          className="btn-primary"
        >
          {saved ? "Saved" : "Save thresholds"}
        </button>
      </div>

      <EmailCard />

      <div className="card space-y-3 p-6">
        <h2 className="text-base font-semibold text-ink">Access roles</h2>
        <RoleRow role="Admin" desc="Full access — run sync, edit thresholds, manage users." />
        <RoleRow role="Manager / Supervisor" desc="View own department and team scorecards; score assigned employees." />
        <RoleRow role="Employee" desc="View own scorecard only." />
      </div>
    </div>
  );
}

// Admin email-notification status + test send. The credential itself
// lives in server env vars (never in the browser or the database); this
// just confirms it's wired up.
function EmailCard() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{
    ok: boolean;
    transport?: string;
    to?: string;
    error?: string;
  } | null>(null);

  const sendTest = async () => {
    setBusy(true);
    setResult(null);
    try {
      const token = await (await import("@/lib/firebase")).auth.currentUser?.getIdToken();
      const res = await fetch("/api/email-test", {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json();
      setResult(data);
    } catch (e: any) {
      setResult({ ok: false, error: e.message || "Request failed." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card space-y-3 p-6">
      <h2 className="text-base font-semibold text-ink">Email notifications</h2>
      <p className="text-sm text-ink-muted">
        Evaluated employees are emailed their scores and comments. Configure a
        sender in your server environment — the recommended, no-domain option is
        SMTP through an existing mailbox (e.g. a Google Workspace{" "}
        <code className="text-ink">@stratus.finance</code> account with an app
        password): set <code className="text-ink">SMTP_HOST</code>,{" "}
        <code className="text-ink">SMTP_USER</code>,{" "}
        <code className="text-ink">SMTP_PASS</code>, and{" "}
        <code className="text-ink">EMAIL_FROM</code>.
      </p>
      <button onClick={sendTest} disabled={busy} className="btn-primary">
        {busy ? "Sending…" : "Send test email to myself"}
      </button>
      {result && (
        <div
          className={`rounded-lg px-4 py-3 text-sm ${
            result.ok
              ? "bg-signal-greenbg text-signal-green"
              : "bg-signal-redbg text-signal-red"
          }`}
        >
          {result.ok ? (
            <>
              Sent to <strong>{result.to}</strong> via the{" "}
              <strong>{result.transport}</strong> transport. Check your inbox.
            </>
          ) : (
            <>{result.error || "Send failed."}</>
          )}
        </div>
      )}
    </div>
  );
}

function ThresholdInput({
  label,
  value,
  onChange,
  color,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  color: string;
}) {
  return (
    <div>
      <label className={`mb-1 block text-sm font-medium ${color}`}>{label}</label>
      <input
        type="number"
        min={0}
        max={100}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full rounded-lg border border-hairline bg-panel-2 text-ink px-3 py-2 text-sm tabular-nums focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
      />
    </div>
  );
}

function RoleRow({ role, desc }: { role: string; desc: string }) {
  return (
    <div className="flex items-start gap-3 rounded-lg bg-panel-2 p-3">
      <span className="pill bg-panel text-ink">{role}</span>
      <span className="text-sm text-ink-muted">{desc}</span>
    </div>
  );
}
