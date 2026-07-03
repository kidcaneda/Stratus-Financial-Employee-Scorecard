import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { Employee, AuditEntry, isDeptLead } from "@/types";

export const runtime = "nodejs";

// ============================================================
// POST /api/employees
// Create or update an employee's record and (optionally) their
// evaluation scores. This is the Phase B write path.
//
// Security (server-enforced, not trusting the client):
//  1. Verify the Firebase ID token.
//  2. Authorize: admins may write anyone; managers only departments
//     listed in their assignments/{uid} doc.
//  3. Write an immutable audit entry for every successful write.
//
// The Admin SDK bypasses Firestore rules by design, so ALL the
// permission logic lives here and must be correct.
// ============================================================

interface AuthedActor {
  uid: string;
  name: string;
  role: string;
}

type AuthResult =
  | { ok: true; actor: AuthedActor }
  | { ok: false; status: number; reason: string };

async function authenticate(req: NextRequest): Promise<AuthResult> {
  const header = req.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token)
    return { ok: false, status: 401, reason: "No auth token sent. Sign in again." };
  try {
    const decoded = await adminAuth().verifyIdToken(token);
    return {
      ok: true,
      actor: {
        uid: decoded.uid,
        name: (decoded.name as string) || decoded.email || "Unknown",
        role: (decoded.role as string) || "employee",
      },
    };
  } catch (e: any) {
    return { ok: false, status: 401, reason: `Token verification failed: ${e.message}` };
  }
}

// Can this actor write to this department?
async function canWriteDept(actor: AuthedActor, departmentId: string): Promise<boolean> {
  if (actor.role === "admin") return true;
  if (!isDeptLead(actor.role)) return false;
  const snap = await adminDb().collection("assignments").doc(actor.uid).get();
  if (!snap.exists) return false;
  const depts: string[] = snap.data()?.departmentIds ?? [];
  return depts.includes(departmentId);
}

async function writeAudit(entry: Omit<AuditEntry, "id">): Promise<void> {
  const ref = adminDb().collection("audit").doc();
  await ref.set({ ...entry, id: ref.id });
}

export async function POST(req: NextRequest) {
  const auth = await authenticate(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: auth.status });
  }
  const { actor } = auth;

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { employee } = body as { employee: Employee };
  if (!employee || !employee.departmentId || !employee.name) {
    return NextResponse.json(
      { error: "Missing required fields: employee.departmentId and employee.name." },
      { status: 400 }
    );
  }

  // Authorization: actor must be allowed to write this department.
  const allowed = await canWriteDept(actor, employee.departmentId);
  if (!allowed) {
    return NextResponse.json(
      {
        error: `You don't have permission to write to "${employee.departmentId}". Managers can only edit their assigned departments.`,
      },
      { status: 403 }
    );
  }

  // Basic server-side validation of the data shape.
  if (employee.type === "kpi" && !Array.isArray(employee.metrics)) {
    return NextResponse.json(
      { error: "KPI employee must include a metrics array." },
      { status: 400 }
    );
  }

  const empRef = adminDb()
    .collection("departments")
    .doc(employee.departmentId)
    .collection("employees")
    .doc(employee.id);

  const existing = await empRef.get();
  const isNew = !existing.exists;

  try {
    await empRef.set(
      {
        ...employee,
        updatedAt: Date.now(),
        updatedBy: actor.uid,
      },
      { merge: true }
    );

    await writeAudit({
      action: isNew ? "create_employee" : "save_evaluation",
      actorUid: actor.uid,
      actorName: actor.name,
      departmentId: employee.departmentId,
      employeeId: employee.id,
      employeeName: employee.name,
      timestamp: Date.now(),
      summary: isNew
        ? `${actor.name} added employee ${employee.name} to ${employee.departmentId}`
        : `${actor.name} saved an evaluation for ${employee.name}`,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: `Write failed: ${e.message}` },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, employeeId: employee.id, created: isNew });
}
