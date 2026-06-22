import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { Department, Metric, Period, SyncLogEntry } from "@/types";

export const runtime = "nodejs";

// ============================================================
// POST /api/sync
// Parses an uploaded Stratus scorecard .xlsx and writes each
// sheet to Firestore as a department document with metrics.
//
// Security: requires a valid Firebase ID token whose custom
// claim role === "admin". The Admin SDK then writes data,
// bypassing client Firestore rules (which is intended — only
// this verified server path may seed).
// ============================================================

type AdminCheck = { ok: true; uid: string } | { ok: false; reason: string };

async function requireAdmin(req: NextRequest): Promise<AdminCheck> {
  const header = req.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;

  // Cause 1: no token reached the server.
  if (!token) {
    return {
      ok: false,
      reason:
        "No auth token was sent with the request. The client isn't attaching your session token — try a fresh sign-in.",
    };
  }

  try {
    const decoded = await adminAuth().verifyIdToken(token);

    // Cause 3: token is valid, but the role custom claim isn't "admin".
    if (decoded.role !== "admin") {
      return {
        ok: false,
        reason: `Your token is valid, but its role claim is "${
          decoded.role ?? "undefined"
        }", not "admin". This means the admin custom claim isn't on your token yet. Re-run set-role.ts against the SAME Firebase project this deployment uses, then sign out and back in.`,
      };
    }

    return { ok: true, uid: decoded.uid };
  } catch (e: any) {
    // Cause 2: verification itself failed (wrong project, bad key, expired).
    return {
      ok: false,
      reason: `Token verification failed: ${e.message}. The most common cause is that Vercel's FIREBASE_ADMIN_* env vars point at a different Firebase project than the one your login token came from, or the private key's \\n escaping is broken.`,
    };
  }
}

// Convert a sheet name into a stable, URL-safe department id.
function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

// Parse a single worksheet into a Department. This is a tolerant
// parser: it expects columns it can recognize and skips the rest.
// EXPECTED COLUMNS (case-insensitive, flexible order):
//   Metric | Target | Unit | Weight | Monthly | Quarterly | Yearly
// Adjust the header matching here to fit the real workbook layout.
function parseSheet(name: string, rows: any[]): { dept: Department; found: number } {
  const metrics: Metric[] = [];
  let idx = 0;

  for (const row of rows) {
    // Normalize keys to lowercase for tolerant matching.
    const r: Record<string, any> = {};
    for (const k of Object.keys(row)) r[k.toLowerCase().trim()] = row[k];

    const metricName = r["metric"] ?? r["kpi"] ?? r["measure"];
    if (!metricName) continue;

    const num = (v: any) => {
      const n = Number(String(v ?? "").replace(/[^0-9.\-]/g, ""));
      return isNaN(n) ? 0 : n;
    };

    const actual: Record<Period, number> = {
      monthly: num(r["monthly"] ?? r["month"] ?? r["actual"]),
      quarterly: num(r["quarterly"] ?? r["quarter"]),
      yearly: num(r["yearly"] ?? r["year"] ?? r["annual"]),
    };

    metrics.push({
      id: `m_${slugify(name)}_${++idx}`,
      name: String(metricName),
      target: num(r["target"] ?? r["goal"]),
      unit: String(r["unit"] ?? ""),
      weight: num(r["weight"]) > 1 ? num(r["weight"]) / 100 : num(r["weight"]),
      higherIsBetter:
        String(r["direction"] ?? "higher").toLowerCase().startsWith("low")
          ? false
          : true,
      actual,
    });
  }

  return {
    dept: {
      id: slugify(name),
      name,
      managerName: "",
      metrics,
    },
    found: metrics.length,
  };
}

export async function POST(req: NextRequest) {
  const check = await requireAdmin(req);
  if (!check.ok) {
    return NextResponse.json({ error: check.reason }, { status: 401 });
  }

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) {
    return NextResponse.json({ error: "No file uploaded." }, { status: 400 });
  }

  let workbook: XLSX.WorkBook;
  try {
    const buf = Buffer.from(await file.arrayBuffer());
    workbook = XLSX.read(buf, { type: "buffer" });
  } catch {
    return NextResponse.json(
      { error: "Could not read the file. Make sure it's a valid .xlsx." },
      { status: 400 }
    );
  }

  const log: SyncLogEntry[] = [];
  const batch = adminDb().batch();

  for (const sheetName of workbook.SheetNames) {
    try {
      const sheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
      const { dept, found } = parseSheet(sheetName, rows);

      if (found === 0) {
        log.push({ sheet: sheetName, metricsFound: 0, status: "skipped", message: "No recognizable metrics." });
        continue;
      }

      const ref = adminDb().collection("departments").doc(dept.id);
      batch.set(ref, dept);
      log.push({ sheet: sheetName, metricsFound: found, status: "ok" });
    } catch (e: any) {
      log.push({ sheet: sheetName, metricsFound: 0, status: "error", message: e.message });
    }
  }

  try {
    await batch.commit();
  } catch (e: any) {
    return NextResponse.json(
      { error: `Write to Firestore failed: ${e.message}`, log },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, log });
}
