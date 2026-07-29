import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { AuditEntry, isDeptLead } from "@/types";

export const runtime = "nodejs";

// ============================================================
// POST /api/resolve-challenge
// A leader (evaluator/admin) closes out an employee's challenge on a
// month's evaluation: the score is upheld as recorded, or marked
// revised. The explanation goes back to the employee.
//
// Body: { departmentId, employeeId, monthKey, outcome, comment }
//   outcome: "upheld" | "revised"
//
// Authorization mirrors the evaluation write path: admins anywhere;
// leads for their own reports (evaluatorUid) or assigned departments.
// ============================================================

interface Actor {
  uid: string;
  name: string;
  role: string;
}

async function canResolve(
  actor: Actor,
  departmentId: string,
  employeeId: string
): Promise<boolean> {
  if (actor.role === "admin") return true;
  if (!isDeptLead(actor.role)) return false;
  const empSnap = await adminDb()
    .collection("departments")
    .doc(departmentId)
    .collection("employees")
    .doc(employeeId)
    .get();
  if (empSnap.exists && empSnap.data()?.evaluatorUid === actor.uid) return true;
  const snap = await adminDb().collection("assignments").doc(actor.uid).get();
  if (!snap.exists) return false;
  return (snap.data()?.departmentIds ?? []).includes(departmentId);
}

export async function POST(req: NextRequest) {
  const header = req.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return NextResponse.json({ error: "No auth token." }, { status: 401 });

  let actor: Actor;
  try {
    const d = await adminAuth().verifyIdToken(token);
    actor = {
      uid: d.uid,
      name: (d.name as string) || d.email || "Unknown",
      role: (d.role as string) || "employee",
    };
  } catch (e: any) {
    return NextResponse.json({ error: `Token failed: ${e.message}` }, { status: 401 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const { departmentId, employeeId, monthKey, outcome, comment } = body as {
    departmentId: string;
    employeeId: string;
    monthKey: string;
    outcome: "upheld" | "revised";
    comment?: string;
  };

  if (!departmentId || !employeeId || !monthKey || !outcome) {
    return NextResponse.json(
      { error: "Need departmentId, employeeId, monthKey, outcome." },
      { status: 400 }
    );
  }
  if (outcome !== "upheld" && outcome !== "revised") {
    return NextResponse.json(
      { error: "outcome must be 'upheld' or 'revised'." },
      { status: 400 }
    );
  }
  // Closing out a challenge always owes the employee an explanation.
  if (!comment?.trim()) {
    return NextResponse.json(
      { error: "A resolution requires a comment explaining the decision." },
      { status: 400 }
    );
  }

  const allowed = await canResolve(actor, departmentId, employeeId);
  if (!allowed) {
    return NextResponse.json(
      { error: "You can only resolve challenges for your own reports." },
      { status: 403 }
    );
  }

  const monthRef = adminDb()
    .collection("departments")
    .doc(departmentId)
    .collection("employees")
    .doc(employeeId)
    .collection("months")
    .doc(monthKey);

  const monthSnap = await monthRef.get();
  if (!monthSnap.exists) {
    return NextResponse.json({ error: "Evaluation not found." }, { status: 404 });
  }
  if (monthSnap.data()?.ackStatus !== "disputed") {
    return NextResponse.json(
      { error: "That evaluation isn't currently challenged." },
      { status: 400 }
    );
  }

  try {
    await monthRef.set(
      {
        resolution: {
          outcome,
          comment: comment.trim(),
          by: actor.uid,
          byName: actor.name,
          at: Date.now(),
        },
      },
      { merge: true }
    );

    const audit: Omit<AuditEntry, "id"> = {
      action: "save_evaluation",
      actorUid: actor.uid,
      actorName: actor.name,
      departmentId,
      employeeId,
      employeeName: employeeId,
      timestamp: Date.now(),
      summary: `${actor.name} ${outcome} the challenged ${monthKey} evaluation`,
    };
    const aref = adminDb().collection("audit").doc();
    await aref.set({ ...audit, id: aref.id });
  } catch (e: any) {
    return NextResponse.json({ error: `Write failed: ${e.message}` }, { status: 500 });
  }

  return NextResponse.json({ ok: true, outcome });
}
