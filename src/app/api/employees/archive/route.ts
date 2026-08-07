import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { AuditEntry, isDeptLead } from "@/types";

export const runtime = "nodejs";

// ============================================================
// POST /api/employees/archive
// Removes someone from a department roster without destroying their
// record: sets `archived`, so the scorecard and every recorded month
// survive for audit while dropping out of rosters and scoring.
// Reversible — pass archived:false to restore.
//
// Body: { departmentId, employeeId, archived? }
// Admins anywhere; leads for their assigned departments.
// ============================================================

export async function POST(req: NextRequest) {
  const header = req.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return NextResponse.json({ error: "No auth token." }, { status: 401 });

  let uid: string;
  let name: string;
  let role: string;
  try {
    const d = await adminAuth().verifyIdToken(token);
    uid = d.uid;
    name = (d.name as string) || d.email || "Unknown";
    role = (d.role as string) || "employee";
  } catch (e: any) {
    return NextResponse.json({ error: `Token failed: ${e.message}` }, { status: 401 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const { departmentId, employeeId, archived = true } = body as {
    departmentId: string;
    employeeId: string;
    archived?: boolean;
  };
  if (!departmentId || !employeeId) {
    return NextResponse.json(
      { error: "Need departmentId and employeeId." },
      { status: 400 }
    );
  }

  // Authorize: admin anywhere, lead only within their assigned departments.
  let allowed = role === "admin";
  if (!allowed && isDeptLead(role)) {
    const snap = await adminDb().collection("assignments").doc(uid).get();
    allowed =
      snap.exists && ((snap.data()?.departmentIds ?? []) as string[]).includes(departmentId);
  }
  if (!allowed) {
    return NextResponse.json(
      { error: "You don't have permission to change this department's roster." },
      { status: 403 }
    );
  }

  const ref = adminDb()
    .collection("departments")
    .doc(departmentId)
    .collection("employees")
    .doc(employeeId);
  const snap = await ref.get();
  if (!snap.exists) {
    return NextResponse.json({ error: "Employee not found." }, { status: 404 });
  }

  try {
    await ref.set(
      { archived, archivedAt: archived ? Date.now() : null },
      { merge: true }
    );
    const audit: Omit<AuditEntry, "id"> = {
      action: "update_employee",
      actorUid: uid,
      actorName: name,
      departmentId,
      employeeId,
      employeeName: (snap.data()?.name as string) || employeeId,
      timestamp: Date.now(),
      summary: `${name} ${archived ? "removed" : "restored"} ${
        snap.data()?.name ?? employeeId
      } ${archived ? "from" : "to"} the ${departmentId} roster`,
    };
    const aref = adminDb().collection("audit").doc();
    await aref.set({ ...audit, id: aref.id });
  } catch (e: any) {
    return NextResponse.json({ error: `Write failed: ${e.message}` }, { status: 500 });
  }

  return NextResponse.json({ ok: true, archived });
}
