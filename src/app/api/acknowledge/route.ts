import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { AuditEntry, AckStatus } from "@/types";

export const runtime = "nodejs";

// ============================================================
// POST /api/acknowledge  (Phase D)
// The EMPLOYEE confirms or disputes their own evaluation.
// Body: { departmentId, employeeId, monthKey, status, comment }
//   status: "acknowledged" | "disputed"
//
// Authorization is different from the manager routes: the actor must
// be the employee the evaluation belongs to. We match by the employee
// record's linked uid (set when the employee account is provisioned).
// ============================================================

export async function POST(req: NextRequest) {
  const header = req.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return NextResponse.json({ error: "No auth token." }, { status: 401 });

  let uid: string;
  let actorName: string;
  try {
    const d = await adminAuth().verifyIdToken(token);
    uid = d.uid;
    actorName = (d.name as string) || d.email || "Employee";
  } catch (e: any) {
    return NextResponse.json({ error: `Token failed: ${e.message}` }, { status: 401 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const { departmentId, employeeId, monthKey, status, comment } = body as {
    departmentId: string;
    employeeId: string;
    monthKey: string;
    status: AckStatus;
    comment?: string;
  };

  if (!departmentId || !employeeId || !monthKey || !status) {
    return NextResponse.json(
      { error: "Need departmentId, employeeId, monthKey, status." },
      { status: 400 }
    );
  }
  if (status !== "acknowledged" && status !== "disputed") {
    return NextResponse.json(
      { error: "status must be 'acknowledged' or 'disputed'." },
      { status: 400 }
    );
  }
  // A dispute must include a reason.
  if (status === "disputed" && !comment?.trim()) {
    return NextResponse.json(
      { error: "A dispute requires a comment explaining the concern." },
      { status: 400 }
    );
  }

  // Authorize: the signed-in user must be the employee being evaluated.
  // The employee record stores `linkedUid` (set at account provisioning).
  const empRef = adminDb()
    .collection("departments")
    .doc(departmentId)
    .collection("employees")
    .doc(employeeId);
  const empSnap = await empRef.get();
  if (!empSnap.exists) {
    return NextResponse.json({ error: "Employee not found." }, { status: 404 });
  }
  const linkedUid = empSnap.data()?.linkedUid;
  if (linkedUid && linkedUid !== uid) {
    return NextResponse.json(
      { error: "You can only respond to your own evaluation." },
      { status: 403 }
    );
  }

  const monthRef = empRef.collection("months").doc(monthKey);
  try {
    await monthRef.set(
      {
        ackStatus: status,
        employeeComment: comment?.trim() ?? "",
        ackAt: Date.now(),
      },
      { merge: true }
    );

    const audit: Omit<AuditEntry, "id"> = {
      action: "save_evaluation",
      actorUid: uid,
      actorName,
      departmentId,
      employeeId,
      employeeName: empSnap.data()?.name ?? employeeId,
      timestamp: Date.now(),
      summary: `${actorName} ${status} their ${monthKey} evaluation${
        comment ? " with a comment" : ""
      }`,
    };
    const aref = adminDb().collection("audit").doc();
    await aref.set({ ...audit, id: aref.id });
  } catch (e: any) {
    return NextResponse.json({ error: `Write failed: ${e.message}` }, { status: 500 });
  }

  return NextResponse.json({ ok: true, status });
}
