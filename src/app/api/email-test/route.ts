import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { sendEmail, emailTransport } from "@/lib/mailer";

export const runtime = "nodejs";

// ============================================================
// POST /api/email-test  (admin only)
// Sends a test email to the calling admin's own address and reports
// which transport is active (smtp / resend / none). Lets an admin
// confirm email is working without scoring someone.
// ============================================================

export async function POST(req: NextRequest) {
  const header = req.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return NextResponse.json({ error: "No auth token." }, { status: 401 });

  let email: string;
  let name: string;
  try {
    const d = await adminAuth().verifyIdToken(token);
    if (d.role !== "admin") {
      return NextResponse.json({ error: "Admins only." }, { status: 403 });
    }
    email = (d.email as string) || "";
    name = (d.name as string) || email || "Admin";
  } catch (e: any) {
    return NextResponse.json({ error: `Token failed: ${e.message}` }, { status: 401 });
  }

  const transport = emailTransport();
  if (transport === "none") {
    return NextResponse.json({
      ok: false,
      transport,
      error:
        "No email transport configured. Set SMTP_HOST / SMTP_USER / SMTP_PASS (recommended) or RESEND_API_KEY in your environment, then redeploy.",
    });
  }
  if (!email) {
    return NextResponse.json(
      { ok: false, transport, error: "Your account has no email address to send the test to." },
      { status: 400 }
    );
  }

  const result = await sendEmail({
    to: email,
    subject: "Stratus Scorecard — test email",
    html: `
    <div style="font-family: system-ui, sans-serif; max-width: 480px; margin: 0 auto; color: #13202E;">
      <div style="background: #13202E; color: #fff; padding: 18px 22px; border-radius: 12px 12px 0 0;">
        <h2 style="margin: 0; font-size: 17px;">Stratus Scorecard</h2>
      </div>
      <div style="border: 1px solid #e2e8f0; border-top: none; padding: 22px; border-radius: 0 0 12px 12px;">
        <p>Hi ${name},</p>
        <p>This is a test email confirming that evaluation notifications are working.</p>
        <p style="color:#5A6B7B; font-size:13px;">Sent via the <strong>${transport}</strong> transport.</p>
      </div>
    </div>`,
  });

  return NextResponse.json({
    ok: result.ok,
    transport,
    to: email,
    error: result.error,
  });
}
