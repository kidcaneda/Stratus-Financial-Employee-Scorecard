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

      <div className="card space-y-3 p-6">
        <h2 className="text-base font-semibold text-ink">Access roles</h2>
        <RoleRow role="Admin" desc="Full access — run sync, edit thresholds, manage users." />
        <RoleRow role="Manager" desc="View own department and team scorecards." />
        <RoleRow role="Employee" desc="View own scorecard only." />
      </div>
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
