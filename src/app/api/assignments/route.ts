import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";

export const runtime = "nodejs";

// ============================================================
// POST /api/assignments  (admin only)
// Sets which departments a manager (by uid) may write to.
// Body: { uid, managerName, departmentIds: string[] }
// ============================================================
export async function POST(req: NextRequest) {
  const header = req.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return NextResponse.json({ error: "No auth token." }, { status: 401 });

  let actorRole: string;
  try {
    const decoded = await adminAuth().verifyIdToken(token);
    actorRole = (decoded.role as string) || "employee";
  } catch (e: any) {
    return NextResponse.json({ error: `Token failed: ${e.message}` }, { status: 401 });
  }
  if (actorRole !== "admin") {
    return NextResponse.json(
      { error: "Only admins can set manager assignments." },
      { status: 403 }
    );
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const { uid, managerName, departmentIds } = body;
  if (!uid || !Array.isArray(departmentIds)) {
    return NextResponse.json(
      { error: "Need uid and departmentIds[]." },
      { status: 400 }
    );
  }

  try {
    await adminDb()
      .collection("assignments")
      .doc(uid)
      .set({ uid, managerName: managerName ?? "", departmentIds }, { merge: true });
  } catch (e: any) {
    return NextResponse.json({ error: `Write failed: ${e.message}` }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
