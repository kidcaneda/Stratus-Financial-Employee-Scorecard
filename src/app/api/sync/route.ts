import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import {
  Department,
  Metric,
  Period,
  SyncLogEntry,
  Criterion,
  CompetencyCard,
} from "@/types";

export const runtime = "nodejs";

// ============================================================
// POST /api/sync
// Parses the Stratus scorecard .xlsx and writes each department
// sheet to Firestore. Matches the REAL workbook layout:
//   - Rows 1-6: title / employee / instructions (ignored)
//   - Row 7:    headers  Metric | Target | Weight | Norm.Wt | Unit | MONTHLY | (gap) | QUARTERLY | (gap) | YEARLY
//   - Row 8:    sub-headers Actual | Score (each period spans 2 cols)
//   - Row 9+:   metric rows, until a WEIGHTED SCORE / RATING row
//
// Column map (1-indexed): A=Metric B=Target C=Weight D=Norm.Wt
//   E=Unit  F=Mon.Actual G=Mon.Score  H=Qtr.Actual I=Qtr.Score
//   J=Yr.Actual K=Yr.Score
//
// Only sheets whose A7 == "Metric" are treated as departments.
// Index, Data Analytics, and Accounting use other formats → skipped.
// ============================================================

type AdminCheck = { ok: true; uid: string } | { ok: false; reason: string };

async function requireAdmin(req: NextRequest): Promise<AdminCheck> {
  const header = req.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) {
    return {
      ok: false,
      reason:
        "No auth token was sent with the request. The client isn't attaching your session token — try a fresh sign-in.",
    };
  }
  try {
    const decoded = await adminAuth().verifyIdToken(token);
    if (decoded.role !== "admin") {
      return {
        ok: false,
        reason: `Your token is valid, but its role claim is "${
          decoded.role ?? "undefined"
        }", not "admin". Re-run set-role.ts against the SAME Firebase project this deployment uses, then sign out and back in.`,
      };
    }
    return { ok: true, uid: decoded.uid };
  } catch (e: any) {
    return {
      ok: false,
      reason: `Token verification failed: ${e.message}. Most commonly the FIREBASE_ADMIN_* env vars point at a different Firebase project, or the private key's \\n escaping is broken.`,
    };
  }
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

// Pull the first number out of a target string like "≥ 95%" or
// "Monthly: ≥ 1,000,000\nQuarterly: ≥ 3,000,000" → 95 / 1000000.
// A rating-scale target ("1-5") means "out of 5", not "target = 1".
function parseTarget(raw: any): number {
  if (raw === null || raw === undefined) return 0;
  const s = String(raw);
  if (/^\s*[01]\s*[-–—]\s*5\s*$/.test(s)) return 5;
  const m = s.match(/-?\d[\d,]*\.?\d*/);
  return m ? Number(m[0].replace(/,/g, "")) : 0;
}

function num(v: any): number {
  const n = Number(String(v ?? "").replace(/[^0-9.\-]/g, ""));
  return isNaN(n) ? 0 : n;
}

// Rows whose metric-name cell signals the end of the metric list.
const STOP_ROWS = ["weighted score", "rating"];

// Parse one standard-template worksheet (array-of-arrays form).
function parseSheet(
  name: string,
  rows: any[][]
): { dept: Department; found: number; rating?: Record<Period, string> } {
  const metrics: Metric[] = [];
  let idx = 0;

  // Data starts at row index 8 (0-based) == spreadsheet row 9.
  for (let i = 8; i < rows.length; i++) {
    const row = rows[i] || [];
    const rawName = row[0];
    if (rawName === undefined || rawName === null || String(rawName).trim() === "")
      continue;

    const lower = String(rawName).trim().toLowerCase();
    if (STOP_ROWS.some((s) => lower.startsWith(s))) break;

    const target = parseTarget(row[1]); // B
    const weightRaw = num(row[2]); // C (already 0–1 in this workbook)
    const unit = String(row[4] ?? ""); // E

    // Each period: Actual then Score. Score is already 0–100 in the sheet.
    const actual: Record<Period, number> = {
      monthly: num(row[5]), // F
      quarterly: num(row[7]), // H
      yearly: num(row[9]), // J
    };
    const score: Record<Period, number> = {
      monthly: num(row[6]), // G
      quarterly: num(row[8]), // I
      yearly: num(row[10]), // K
    };

    metrics.push({
      id: `m_${slugify(name)}_${++idx}`,
      name: String(rawName).replace(/\\n/g, " ").replace(/\s+/g, " ").trim(),
      target,
      unit,
      weight: weightRaw > 1 ? weightRaw / 100 : weightRaw,
      higherIsBetter: !/(rework|error|discrepancy|dormant|turnaround|cost|time to)/i.test(
        String(rawName)
      ),
      actual,
      // Pre-calculated scores from the sheet, used directly by the app.
      score,
    } as Metric & { score: Record<Period, number> });
  }

  // Capture the sheet's own RATING row (GREEN/AMBER/RED) if present.
  let rating: Record<Period, string> | undefined;
  for (let i = 8; i < rows.length; i++) {
    const row = rows[i] || [];
    if (String(row[0] ?? "").trim().toLowerCase().startsWith("rating")) {
      rating = {
        monthly: String(row[6] ?? ""),
        quarterly: String(row[8] ?? ""),
        yearly: String(row[10] ?? ""),
      };
      break;
    }
  }

  return {
    dept: { id: slugify(name), name, managerName: "", type: "kpi", metrics },
    found: metrics.length,
    rating,
  };
}

// Detect the 1–5 competency template (e.g. Accounting):
// spreadsheet row 7 headers are # | Criterion | What 'Good'... | Weight | Score (1-5) | Weighted | Comments
function isCompetencySheet(rows: any[][]): boolean {
  const h = (rows[6] || []).map((c) => String(c ?? "").trim().toLowerCase());
  return h[0] === "#" && h[1] === "criterion" && h[4]?.startsWith("score");
}

// Parse a 1–5 competency sheet into a CompetencyCard.
// Section header rows (no #, no weight) set the current section.
// Criterion rows have a numeric # in col A. The OVERALL / PERFORMANCE BAND
// rows are captured for the summary.
function parseCompetencySheet(
  name: string,
  rows: any[][]
): { dept: Department; found: number } {
  const criteria: Criterion[] = [];
  let section = "";
  let overall = 0;
  let band = "";
  let idx = 0;

  for (let i = 7; i < rows.length; i++) {
    const row = rows[i] || [];
    const a = String(row[0] ?? "").trim();
    if (a === "") continue;

    const upper = a.toUpperCase();
    // Section headers, e.g. "OPERATIONAL PERFORMANCE — Section Weight: 40%"
    if (upper.includes("SECTION WEIGHT")) {
      section = a.split("—")[0].split("-")[0].trim();
      continue;
    }
    if (upper.startsWith("OVERALL WEIGHTED SCORE")) {
      overall = num(row[5]); // F column: out of 5.00
      continue;
    }
    if (upper.startsWith("PERFORMANCE BAND")) {
      band = String(row[5] ?? "").trim();
      continue;
    }
    // Stop once we hit the rating-guide / how-to footer.
    if (upper.startsWith("RATING GUIDE") || upper.startsWith("HOW TO USE")) break;
    if (upper.startsWith("EMPLOYEE COMMENTS") || upper.startsWith("LEADER COMMENTS"))
      continue;

    // A criterion row has a numeric index in column A.
    if (/^\d+$/.test(a)) {
      const critName = String(row[1] ?? "").trim();
      if (!critName) continue;
      criteria.push({
        id: `c_${slugify(name)}_${++idx}`,
        number: a,
        name: critName,
        descriptor: String(row[2] ?? "").replace(/\\n/g, " ").trim(),
        section,
        weight: num(row[3]),
        score: num(row[4]),
        weighted: num(row[5]),
        comments: String(row[6] ?? "").trim(),
      });
    }
  }

  const competency: CompetencyCard = { criteria, overall, band };
  return {
    dept: {
      id: slugify(name),
      name,
      managerName: "",
      type: "competency",
      metrics: [],
      competency,
    },
    found: criteria.length,
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
      // Array-of-arrays so we can address fixed columns regardless of headers.
      const rows = XLSX.utils.sheet_to_json<any[]>(sheet, {
        header: 1,
        defval: "",
        blankrows: true,
      });

      // Standard template check: spreadsheet row 7 (index 6), col A == "Metric".
      const headerCell = String(rows[6]?.[0] ?? "").trim().toLowerCase();
      if (headerCell !== "metric") {
        // Try the 1–5 competency template (e.g. Accounting) before skipping.
        if (isCompetencySheet(rows)) {
          const { dept, found } = parseCompetencySheet(sheetName, rows);
          if (found > 0) {
            const ref = adminDb().collection("departments").doc(dept.id);
            batch.set(ref, dept);
            log.push({ sheet: sheetName, metricsFound: found, status: "ok" });
            continue;
          }
        }
        log.push({
          sheet: sheetName,
          metricsFound: 0,
          status: "skipped",
          message: "Not a standard scorecard sheet (different template).",
        });
        continue;
      }

      const { dept, found } = parseSheet(sheetName, rows);
      if (found === 0) {
        log.push({
          sheet: sheetName,
          metricsFound: 0,
          status: "skipped",
          message: "No metric rows found.",
        });
        continue;
      }

      const ref = adminDb().collection("departments").doc(dept.id);
      batch.set(ref, dept);
      log.push({ sheet: sheetName, metricsFound: found, status: "ok" });
    } catch (e: any) {
      log.push({
        sheet: sheetName,
        metricsFound: 0,
        status: "error",
        message: e.message,
      });
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
