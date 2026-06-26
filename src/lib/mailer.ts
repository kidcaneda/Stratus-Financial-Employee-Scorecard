// ============================================================
// Email delivery via Resend (server-side only).
// Degrades gracefully: if RESEND_API_KEY is not set, sends are
// skipped and logged, so the app works before email is configured.
// Set these env vars in Vercel when ready:
//   RESEND_API_KEY  — from resend.com dashboard
//   EMAIL_FROM      — verified sender, e.g. "Stratus <noreply@yourdomain>"
//   APP_URL         — base URL of the deployed app, for links in emails
// ============================================================

interface SendResult {
  ok: boolean;
  skipped?: boolean;
  error?: string;
}

export async function sendEmail(opts: {
  to: string;
  subject: string;
  html: string;
}): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM || "Stratus Scorecard <onboarding@resend.dev>";

  // No key configured yet → skip silently so the write still succeeds.
  if (!apiKey) {
    console.log(`[email skipped: no RESEND_API_KEY] would send to ${opts.to}: ${opts.subject}`);
    return { ok: true, skipped: true };
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: opts.to,
        subject: opts.subject,
        html: opts.html,
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      return { ok: false, error: `Resend ${res.status}: ${text}` };
    }
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e.message };
  }
}

// Builds the notification email an employee receives when evaluated.
export function evaluationEmail(opts: {
  employeeName: string;
  monthLabel: string;
  evaluatorName: string;
  reviewUrl: string;
}): { subject: string; html: string } {
  const subject = `Your ${opts.monthLabel} performance evaluation is ready`;
  const html = `
  <div style="font-family: system-ui, sans-serif; max-width: 520px; margin: 0 auto; color: #13202E;">
    <div style="background: #13202E; color: #fff; padding: 20px 24px; border-radius: 12px 12px 0 0;">
      <h2 style="margin: 0; font-size: 18px;">Stratus Scorecard</h2>
    </div>
    <div style="border: 1px solid #e2e8f0; border-top: none; padding: 24px; border-radius: 0 0 12px 12px;">
      <p>Hi ${opts.employeeName},</p>
      <p>Your performance evaluation for <strong>${opts.monthLabel}</strong> has been recorded by ${opts.evaluatorName}.</p>
      <p>Please review it, then confirm or raise any concerns:</p>
      <p style="margin: 24px 0;">
        <a href="${opts.reviewUrl}" style="background: #2E6BE6; color: #fff; text-decoration: none; padding: 10px 20px; border-radius: 8px; font-weight: 600;">Review your evaluation</a>
      </p>
      <p style="color: #5A6B7B; font-size: 13px;">If the button doesn't work, paste this link into your browser:<br>${opts.reviewUrl}</p>
    </div>
  </div>`;
  return { subject, html };
}
