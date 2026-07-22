import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";

export const runtime = "nodejs";

// ============================================================
// POST /api/provision-me
// Self-service access sync: a freshly-created account calls this with
// its own ID token and gets its role + department resolved from the
// company directory, then linked to its employee record — no admin
// step. This is what lets someone "sign up with their company email
// and immediately have access."
//
// Role resolution (never downgrades admin/manager):
//   1. existing admin/manager claim            → kept as-is
//   2. directory/{email} doc                    → its role + departmentId
//   3. an employee record with this email       → "employee" + that dept
//   4. email on the allowed company domain      → "employee" (no dept)
//   5. otherwise                                → 403, not authorized
// ============================================================

const ALLOWED_DOMAIN = (process.env.ALLOWED_EMAIL_DOMAIN || "stratus.finance").toLowerCase();

export async function POST(req: NextRequest) {
  const header = req.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return NextResponse.json({ error: "No auth token." }, { status: 401 });

  let uid: string;
  let email: string;
  let displayName: string;
  let claims: Record<string, unknown>;
  try {
    const d = await adminAuth().verifyIdToken(token);
    uid = d.uid;
    email = (d.email as string || "").toLowerCase();
    displayName = (d.name as string) || d.email || "";
    claims = (d as any) || {};
  } catch (e: any) {
    return NextResponse.json({ error: `Token failed: ${e.message}` }, { status: 401 });
  }
  if (!email) {
    return NextResponse.json({ error: "Your account has no email address." }, { status: 400 });
  }

  const currentRole = (claims.role as string) || null;

  // Resolve the role + department this email is entitled to.
  let role: string | null = null;
  let departmentId: string | null = null;
  let name = displayName;

  if (currentRole === "admin" || currentRole === "manager") {
    role = currentRole; // never downgrade an elevated account
  } else {
    const dirSnap = await adminDb().collection("directory").doc(email).get();
    if (dirSnap.exists) {
      const d = dirSnap.data()!;
      role = (d.role as string) || "employee";
      departmentId = (d.departmentId as string) ?? null;
      name = (d.name as string) || name;
    } else {
      // Fall back to an employee record carrying this email.
      try {
        const empSnap = await adminDb()
          .collectionGroup("employees")
          .where("email", "==", email)
          .limit(1)
          .get();
        if (!empSnap.empty) {
          role = "employee";
          departmentId = (empSnap.docs[0].data().departmentId as string) ?? null;
          name = (empSnap.docs[0].data().name as string) || name;
        }
      } catch {
        // index missing — fall through to the domain check
      }
      if (!role && email.endsWith(`@${ALLOWED_DOMAIN}`)) {
        role = "employee"; // any company-domain address gets baseline access
      }
    }
  }

  if (!role) {
    return NextResponse.json(
      {
        error: `${email} isn't in the company directory. Ask an admin to add you, or use your @${ALLOWED_DOMAIN} address.`,
      },
      { status: 403 }
    );
  }

  // Set the claim only when it actually changes (a claim change requires
  // the client to refresh its token).
  const claimChanged = currentRole !== role;
  try {
    if (claimChanged) {
      await adminAuth().setCustomUserClaims(uid, { ...stripReserved(claims), role });
    }
    await adminDb().collection("users").doc(uid).set(
      { uid, email, displayName: name, role, departmentId: departmentId ?? null },
      { merge: true }
    );

    // Link every employee record with this email to the account so the
    // person sees their own evaluations.
    let linked = 0;
    try {
      const owned = await adminDb()
        .collectionGroup("employees")
        .where("email", "==", email)
        .get();
      const batch = adminDb().batch();
      owned.docs.forEach((doc) => {
        batch.set(doc.ref, { linkedUid: uid }, { merge: true });
      });
      await batch.commit();
      linked = owned.size;
    } catch {
      // linking is best-effort; role is already granted
    }

    return NextResponse.json({ ok: true, role, departmentId, linked, claimChanged });
  } catch (e: any) {
    return NextResponse.json({ error: `Provision failed: ${e.message}` }, { status: 500 });
  }
}

// Drop the reserved JWT fields so they aren't copied into custom claims.
function stripReserved(claims: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const reserved = new Set([
    "iss", "aud", "auth_time", "user_id", "sub", "iat", "exp", "email",
    "email_verified", "firebase", "uid", "name", "picture",
  ]);
  for (const [k, v] of Object.entries(claims)) {
    if (!reserved.has(k)) out[k] = v;
  }
  return out;
}
