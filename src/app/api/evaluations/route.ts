import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { MonthlyEvaluation, AuditEntry } from "@/types";
import { sendEmail, evaluationEmail } from "@/lib/mailer";

export const runtime = "nodejs";

// ============================================================
// POST /api/evaluations  (Phase C)
// Saves a dated monthly evaluation for one employee at
// departments/{deptId}/employees/{empId}/months/{monthKey}.
// Quarterly/yearly are never written — they're computed from these.
//
// Same security model as /api/employees: verify token, authorize
// against the manager's department assignments, write an audit entry.
// ============================================================

interface Actor {
  uid: string;
  name: string;
  role: string;
}

async function authenticate(
  req: NextRequest
): Promise<{ ok: true; actor: Actor } | { ok: false; status: number; reason: string }> {
  const header = req.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return { ok: false, status: 401, reason: "No auth token sent." };
  try {
    const d = await adminAuth().verifyIdToken(token);
    return {
      ok: true,
      actor: {
        uid: d.uid,
        name: (d.name as string) || d.email || "Unknown",
        role: (d.role as string) || "employee",
      },
    };
  } catch (e: any) {
    return { ok: false, status: 401, reason: `Token failed: ${e.message}` };
  }
}

async function canWriteDept(actor: Actor, departmentId: string): Promise<boolean> {
  if (actor.role === "admin") return true;
  if (actor.role !== "manager") return false;
  const snap = await adminDb().collection("assignments").doc(actor.uid).get();
  if (!snap.exists) return false;
  return (snap.data()?.departmentIds ?? []).includes(departmentId);
}

async function writeAudit(entry: Omit<AuditEntry, "id">): Promise<void> {
  const ref = adminDb().collection("audit").doc();
  await ref.set({ ...entry, id: ref.id });
}

export async function POST(req: NextRequest) {
  const auth = await authenticate(req);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });
  const { actor } = auth;

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const { evaluation } = body as { evaluation: MonthlyEvaluation };
  if (
    !evaluation ||
    !evaluation.departmentId ||
    !evaluation.employeeId ||
    !evaluation.monthKey ||
    !Array.isArray(evaluation.entries)
  ) {
    return NextResponse.json(
      { error: "Missing fields: departmentId, employeeId, monthKey, entries[]." },
      { status: 400 }
    );
  }

  // monthKey must look like YYYY-MM.
  if (!/^\d{4}-\d{2}$/.test(evaluation.monthKey)) {
    return NextResponse.json(
      { error: `Invalid monthKey "${evaluation.monthKey}". Expected YYYY-MM.` },
      { status: 400 }
    );
  }

  const allowed = await canWriteDept(actor, evaluation.departmentId);
  if (!allowed) {
    return NextResponse.json(
      { error: "You can only record evaluations for your assigned departments." },
      { status: 403 }
    );
  }

  const ref = adminDb()
    .collection("departments")
    .doc(evaluation.departmentId)
    .collection("employees")
    .doc(evaluation.employeeId)
    .collection("months")
    .doc(evaluation.monthKey);

  try {
    await ref.set(
      {
        ...evaluation,
        ackStatus: "pending",
        recordedBy: actor.uid,
        recordedByName: actor.name,
        recordedAt: Date.now(),
      },
      { merge: true }
    );

    await writeAudit({
      action: "save_evaluation",
      actorUid: actor.uid,
      actorName: actor.name,
      departmentId: evaluation.departmentId,
      employeeId: evaluation.employeeId,
      employeeName: evaluation.employeeId,
      timestamp: Date.now(),
      summary: `${actor.name} recorded ${evaluation.monthKey} evaluation`,
    });
  } catch (e: any) {
    return NextResponse.json({ error: `Write failed: ${e.message}` }, { status: 500 });
  }

  // Phase D: notify the employee by email (best-effort; never blocks the
  // save). Looks up the employee's email from their record.
  let emailNote: string | undefined;
  try {
    const empSnap = await adminDb()
      .collection("departments")
      .doc(evaluation.departmentId)
      .collection("employees")
      .doc(evaluation.employeeId)
      .get();
    const empEmail = empSnap.data()?.email;
    const empName = empSnap.data()?.name ?? "there";
    if (empEmail) {
      const appUrl = process.env.APP_URL || "";
      const reviewUrl = `${appUrl}/my-evaluations`;
      const { subject, html } = evaluationEmail({
        employeeName: empName,
        monthLabel: evaluation.monthKey,
        evaluatorName: actor.name,
        reviewUrl,
      });
      const sent = await sendEmail({ to: empEmail, subject, html });
      if (sent.skipped) emailNote = "Email service not configured; notification skipped.";
      else if (!sent.ok) emailNote = `Email failed: ${sent.error}`;
    } else {
      emailNote = "Employee has no email on file; notification skipped.";
    }
  } catch (e: any) {
    emailNote = `Email step error: ${e.message}`;
  }

  return NextResponse.json({ ok: true, monthKey: evaluation.monthKey, emailNote });
}
