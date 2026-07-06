"use client";

import { useState } from "react";
import Link from "next/link";
import { useAuth } from "@/hooks/useAuth";
import type { ImportEntry, ImportReport } from "@/lib/directory-import";

// ============================================================
// Directory Import (admin only) — upload the employee-directory
// workbook, preview exactly what will be created, then commit.
// Populates employees, reporting lines (evaluatorUid), leader
// assignments, and role claims in one pass via /api/import-directory.
// ============================================================

export default function DirectoryImportPage() {
  const { user } = useAuth();
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState<"dry" | "write" | null>(null);
  const [report, setReport] = useState<ImportReport | null>(null);
  const [error, setError] = useState("");

  if (user && user.role !== "admin") {
    return (
      <div className="card p-6">
        <h1 className="text-lg font-semibold text-ink">Restricted</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Directory import is available to administrators only.
        </p>
      </div>
    );
  }

  const run = async (mode: "dry" | "write") => {
    if (!file) return;
    setBusy(mode);
    setError("");
    try {
      const token = await (
        await import("@/lib/firebase")
      ).auth.currentUser?.getIdToken();
      const form = new FormData();
      form.append("file", file);
      form.append("mode", mode);
      const res = await fetch("/api/import-directory", {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Import failed");
      setReport(data);
    } catch (e: any) {
      setError(e.message || "Something went wrong during import.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink">Directory Import</h1>
        <p className="text-sm text-ink-muted">
          Upload the employee directory workbook to create employees and
          reporting lines. Preview first — nothing is written until you commit.
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
          Drag &amp; drop the directory <span className="font-medium text-ink">.xlsx</span> here
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

      <div className="flex items-center gap-3">
        <button
          onClick={() => run("dry")}
          disabled={!file || !!busy}
          className="btn-ghost"
        >
          {busy === "dry" ? "Previewing…" : "Preview (dry run)"}
        </button>
        <button
          onClick={() => run("write")}
          disabled={!file || !!busy}
          className="btn-primary"
        >
          {busy === "write" ? "Importing…" : "Import & write"}
        </button>
        {error && <p className="text-sm text-signal-red">{error}</p>}
      </div>

      {report && (
        <>
          <div className={`card p-4 text-sm ${report.write ? "border-signal-green/40" : ""}`}>
            <span className="font-medium text-ink">
              {report.write ? "Imported" : "Plan"}:
            </span>{" "}
            <span className="text-ink-muted">
              {report.peopleInFile} people in file · {report.created} new employee
              record{report.created === 1 ? "" : "s"} · {report.merged} existing merged
              {!report.write && " — nothing written yet. Review below, then click Import & write."}
            </span>
            {report.write && (
              <span className="text-ink-muted">
                {" "}
                — done. Open{" "}
                <Link href="/my-team" className="text-accent hover:underline">
                  My Team
                </Link>{" "}
                to start scoring.
              </span>
            )}
          </div>

          <div className="card overflow-hidden">
            <div className="border-b border-hairline bg-panel-2 px-4 py-2 text-xs uppercase tracking-wide text-ink-muted">
              {report.write ? "Import log" : "Import plan"}
            </div>
            <ul className="divide-y divide-hairline text-sm">
              {report.entries.map((e, i) => (
                <li key={i} className="flex items-start gap-2 px-4 py-2">
                  <EntryBadge level={e.level} />
                  <span className={e.level === "info" ? "font-medium text-ink" : "text-ink-muted"}>
                    {e.text}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {report.unmapped.length > 0 && (
            <div className="card overflow-hidden">
              <div className="border-b border-hairline bg-panel-2 px-4 py-2 text-xs uppercase tracking-wide text-ink-muted">
                Not imported ({report.unmapped.length}) — no scorecard department mapped
              </div>
              <table className="w-full text-sm">
                <tbody className="divide-y divide-hairline">
                  {report.unmapped.map((r) => (
                    <tr key={r.email}>
                      <td className="px-4 py-2 font-medium text-ink">{r.name}</td>
                      <td className="px-4 py-2 text-ink-muted">{r.position}</td>
                      <td className="px-4 py-2 text-right text-ink-muted">{r.email}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function EntryBadge({ level }: { level: ImportEntry["level"] }) {
  const map: Record<ImportEntry["level"], { label: string; cls: string }> = {
    add: { label: "add", cls: "bg-signal-green/15 text-signal-green" },
    merge: { label: "merge", cls: "bg-accent/15 text-accent" },
    warn: { label: "warn", cls: "bg-signal-amber/15 text-signal-amber" },
    info: { label: "dept", cls: "bg-panel-2 text-ink-muted" },
  };
  const { label, cls } = map[level];
  return (
    <span className={`pill mt-0.5 shrink-0 ${cls}`}>{label}</span>
  );
}
