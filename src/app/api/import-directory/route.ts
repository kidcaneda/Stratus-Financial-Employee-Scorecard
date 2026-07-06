import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { importDirectory } from "@/lib/directory-import";

export const runtime = "nodejs";

// ============================================================
// POST /api/import-directory  (admin only)
// Body: multipart form — `file` (the directory .xlsx) and `mode`
// ("dry" previews the plan, "write" commits it).
// Returns the ImportReport from the shared import engine.
// ============================================================

export async function POST(req: NextRequest) {
  const header = req.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return NextResponse.json({ error: "No auth token." }, { status: 401 });

  try {
    const decoded = await adminAuth().verifyIdToken(token);
    if (decoded.role !== "admin") {
      return NextResponse.json(
        { error: `Only admins can import the directory (your role claim: "${decoded.role ?? "none"}").` },
        { status: 403 }
      );
    }
  } catch (e: any) {
    return NextResponse.json({ error: `Token failed: ${e.message}` }, { status: 401 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart form data." }, { status: 400 });
  }
  const file = form.get("file");
  const mode = String(form.get("mode") ?? "dry");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Attach the directory .xlsx as `file`." }, { status: 400 });
  }

  try {
    const buf = Buffer.from(await file.arrayBuffer());
    const report = await importDirectory(buf, { write: mode === "write" });
    return NextResponse.json(report);
  } catch (e: any) {
    return NextResponse.json({ error: `Import failed: ${e.message}` }, { status: 500 });
  }
}
