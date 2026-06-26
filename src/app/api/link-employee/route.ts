import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";

export const runtime = "nodejs";

// ============================================================
// POST /api/link-employee  (admin only)
// Links an employee record to a Firebase Auth account so the person
// can log in and see/acknowledge only their own evaluations.
// Body: { departmentId, employeeId, email }
//
// Resolves the email to a Firebase Auth uid, sets the employee's
// linkedUid, and gives that account the "employee" role claim if it
// has none. This is the connecting piece the acknowledge flow needs.
// ============================================================
export async function POST(req: NextRequest) {
  const header = req.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return NextResponse.json({ error: "No auth token." }, { status: 401 });

  let actorRole: string;
  try {
    const d = await adminAuth().verifyIdToken(token);
    actorRole = (d.role as string) || "employee";
  } catch (e: any) {
    return NextResponse.json({ error: `Token failed: ${e.message}` }, { status: 401 });
  }
  if (actorRole !== "admin") {
    return NextResponse.json(
      { error: "Only admins can link employee accounts." },
      { status: 403 }
    );
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const { departmentId, employeeId, email } = body;
  if (!departmentId || !employeeId || !email) {
    return NextResponse.json(
      { error: "Need departmentId, employeeId, email." },
      { status: 400 }
    );
  }

  // Resolve the email to an Auth account.
  let uid: string;
  try {
    const userRecord = await adminAuth().getUserByEmail(email);
    uid = userRecord.uid;
    // Give an employee role claim if none set, without downgrading managers/admins.
    const existingRole = (userRecord.customClaims as any)?.role;
    if (!existingRole) {
      await adminAuth().setCustomUserClaims(uid, { role: "employee" });
    }
  } catch (e: any) {
    return NextResponse.json(
      {
        error: `No Firebase Auth account found for ${email}. Create the account first, then link it.`,
      },
      { status: 404 }
    );
  }

  try {
    await adminDb()
      .collection("departments")
      .doc(departmentId)
      .collection("employees")
      .doc(employeeId)
      .set({ linkedUid: uid }, { merge: true });
  } catch (e: any) {
    return NextResponse.json({ error: `Link write failed: ${e.message}` }, { status: 500 });
  }

  return NextResponse.json({ ok: true, linkedUid: uid });
}
