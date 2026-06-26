"use client";

import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { SyncLogEntry } from "@/types";

export default function SyncPage() {
  const { user } = useAuth();
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<SyncLogEntry[]>([]);
  const [error, setError] = useState("");

  // Client-side role guard. Server enforces again in the API route.
  if (user && user.role !== "admin") {
    return (
      <div className="card p-6">
        <h1 className="text-lg font-semibold text-ink">Restricted</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Excel sync is available to administrators only.
        </p>
      </div>
    );
  }

  const handleUpload = async () => {
    if (!file) return;
    setBusy(true);
    setError("");
    setLog([]);
    try {
      const token = await (
        await import("@/lib/firebase")
      ).auth.currentUser?.getIdToken();
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/sync", {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Sync failed");
      setLog(data.log || []);
    } catch (e: any) {
      setError(e.message || "Something went wrong during sync.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink">Excel Sync</h1>
        <p className="text-sm text-ink-muted">
          Upload the Stratus scorecard workbook to seed Firestore.
        </p>
      </div>

      <div
        className="card flex flex-col items-center justify-center gap-3 border-2 border-dashed border-hairline p-10 text-center"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const f = e.dataTransfer.files?.[0];
          if (f) setFile(f);
        }}
      >
        <p className="text-sm text-ink-muted">
          Drag & drop your <span className="font-medium text-ink">.xlsx</span> file here
        </p>
        <label className="btn-ghost cursor-pointer">
          Choose file
          <input
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </label>
        {file && <p className="text-sm font-medium text-ink">{file.name}</p>}
      </div>

      <button onClick={handleUpload} disabled={!file || busy} className="btn-primary">
        {busy ? "Syncing…" : "Run sync"}
      </button>

      {error && <p className="text-sm text-signal-red">{error}</p>}

      {log.length > 0 && (
        <div className="card overflow-hidden">
          <div className="border-b border-hairline bg-panel-2 px-4 py-2 text-xs uppercase tracking-wide text-ink-muted">
            Sync log
          </div>
          <table className="w-full text-sm">
            <tbody className="divide-y divide-hairline">
              {log.map((entry, i) => (
                <tr key={i}>
                  <td className="px-4 py-2 font-medium text-ink">{entry.sheet}</td>
                  <td className="px-4 py-2 text-ink-muted">
                    {entry.metricsFound} metrics
                  </td>
                  <td className="px-4 py-2 text-right">
                    <span
                      className={
                        entry.status === "ok"
                          ? "text-signal-green"
                          : entry.status === "skipped"
                          ? "text-signal-amber"
                          : "text-signal-red"
                      }
                    >
                      {entry.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
