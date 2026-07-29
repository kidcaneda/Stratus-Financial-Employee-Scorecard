// ============================================================
// Email delivery (server-side only). Two transports, tried in order,
// so you can pick whichever fits — no code change:
//
//  1. SMTP  (RECOMMENDED — no domain purchase, no DNS verification)
//     Send through an existing mailbox with an app password, e.g. a
//     Google Workspace @stratus.finance account or any Gmail:
//       SMTP_HOST=smtp.gmail.com
//       SMTP_PORT=465
//       SMTP_USER=notifications@stratus.finance   (the real mailbox)
//       SMTP_PASS=xxxxxxxxxxxxxxxx                 (a Google App Password)
//       EMAIL_FROM=Stratus Scorecard <notifications@stratus.finance>
//     Email is sent AS that mailbox, so it reaches anyone with no DNS.
//
//  2. Resend (needs a verified sending domain):
//       RESEND_API_KEY, EMAIL_FROM
//
// If neither is configured, sends are skipped and logged so writes
// still succeed. Set APP_URL for the links in emails.
// ============================================================

import nodemailer from "nodemailer";

interface SendResult {
  ok: boolean;
  skipped?: boolean;
  error?: string;
  transport?: "smtp" | "resend";
}

// Which transport is configured, for the admin status card.
export function emailTransport(): "smtp" | "resend" | "none" {
  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) return "smtp";
  if (process.env.RESEND_API_KEY) return "resend";
  return "none";
}

async function sendViaSmtp(opts: {
  to: string;
  subject: string;
  html: string;
}): Promise<SendResult> {
  const host = process.env.SMTP_HOST!;
  const user = process.env.SMTP_USER!;
  const pass = process.env.SMTP_PASS!;
  const port = Number(process.env.SMTP_PORT || 465);
  // Gmail rewrites From to the authenticated mailbox, so default to it.
  const from = process.env.EMAIL_FROM || user;
  try {
    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465, // 465 = implicit TLS; 587 = STARTTLS
      auth: { user, pass },
    });
    await transporter.sendMail({
      from,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
    });
    return { ok: true, transport: "smtp" };
  } catch (e: any) {
    return { ok: false, error: `SMTP: ${e.message}`, transport: "smtp" };
  }
}

async function sendViaResend(opts: {
  to: string;
  subject: string;
  html: string;
}): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY!;
  const from = process.env.EMAIL_FROM || "Stratus Scorecard <onboarding@resend.dev>";
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from, to: opts.to, subject: opts.subject, html: opts.html }),
    });
    if (!res.ok) {
      const text = await res.text();
      return { ok: false, error: `Resend ${res.status}: ${text}`, transport: "resend" };
    }
    return { ok: true, transport: "resend" };
  } catch (e: any) {
    return { ok: false, error: e.message, transport: "resend" };
  }
}

export async function sendEmail(opts: {
  to: string;
  subject: string;
  html: string;
}): Promise<SendResult> {
  const transport = emailTransport();
  if (transport === "smtp") return sendViaSmtp(opts);
  if (transport === "resend") return sendViaResend(opts);
  console.log(`[email skipped: no transport configured] would send to ${opts.to}: ${opts.subject}`);
  return { ok: true, skipped: true };
}

// Minimal shapes the email renderer needs (kept local so the mailer has
// no import cycle with the domain types).
interface EmailMetricRow {
  metricName: string;
  actual: number;
  unit: string;
  score: number;
}
interface EmailGrow {
  goals?: string;
  realities?: string;
  opportunities?: string;
  wayForward?: string;
}

function esc(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function fmtNum(n: number): string {
  return Number(n).toLocaleString("en-US", { maximumFractionDigits: 1 });
}

// Builds the notification email an employee receives when evaluated. When
// the metric breakdown and/or evaluator comments are supplied, the full
// contents are included in the email body (not just a link).
export function evaluationEmail(opts: {
  employeeName: string;
  monthLabel: string;
  evaluatorName: string;
  reviewUrl: string;
  overall?: number;
  entries?: EmailMetricRow[];
  grow?: EmailGrow;
}): { subject: string; html: string } {
  const subject = `Your ${opts.monthLabel} performance evaluation is ready`;

  const overallBlock =
    typeof opts.overall === "number"
      ? `<p style="margin: 8px 0 20px;">Overall score:
           <strong style="font-size: 20px; color: #13202E;">${fmtNum(opts.overall)}</strong>
           <span style="color:#5A6B7B;"> / 100</span></p>`
      : "";

  const metricsBlock =
    opts.entries && opts.entries.length
      ? `<h3 style="font-size: 14px; margin: 20px 0 8px; color:#13202E;">Scores</h3>
         <table style="width:100%; border-collapse: collapse; font-size: 13px;">
           <thead>
             <tr style="text-align:left; color:#5A6B7B; border-bottom:1px solid #e2e8f0;">
               <th style="padding:6px 8px;">Metric</th>
               <th style="padding:6px 8px; text-align:right;">Actual</th>
               <th style="padding:6px 8px; text-align:right;">Score</th>
             </tr>
           </thead>
           <tbody>
             ${opts.entries
               .map(
                 (m) => `<tr style="border-bottom:1px solid #f1f5f9;">
                   <td style="padding:6px 8px; color:#13202E;">${esc(m.metricName)}</td>
                   <td style="padding:6px 8px; text-align:right; color:#5A6B7B;">${fmtNum(
                     m.actual
                   )} ${esc(m.unit)}</td>
                   <td style="padding:6px 8px; text-align:right; font-weight:600; color:#13202E;">${fmtNum(
                     m.score
                   )}</td>
                 </tr>`
               )
               .join("")}
           </tbody>
         </table>`
      : "";

  const growFields: { label: string; value?: string }[] = [
    { label: "Goals", value: opts.grow?.goals },
    { label: "Realities (Root Cause)", value: opts.grow?.realities },
    { label: "Opportunities", value: opts.grow?.opportunities },
    { label: "Way Forward (Action Plans)", value: opts.grow?.wayForward },
  ].filter((f) => (f.value ?? "").trim() !== "");

  const growBlock = growFields.length
    ? `<h3 style="font-size: 14px; margin: 22px 0 8px; color:#13202E;">Evaluator comments</h3>
       ${growFields
         .map(
           (f) => `<div style="margin-bottom:10px;">
             <div style="font-size:11px; text-transform:uppercase; letter-spacing:.04em; color:#5A6B7B; margin-bottom:2px;">${esc(
               f.label
             )}</div>
             <div style="font-size:13px; color:#13202E; white-space:pre-wrap;">${esc(
               f.value!
             )}</div>
           </div>`
         )
         .join("")}`
    : "";

  const html = `
  <div style="font-family: system-ui, sans-serif; max-width: 560px; margin: 0 auto; color: #13202E;">
    <div style="background: #13202E; color: #fff; padding: 20px 24px; border-radius: 12px 12px 0 0;">
      <h2 style="margin: 0; font-size: 18px;">Stratus Scorecard</h2>
    </div>
    <div style="border: 1px solid #e2e8f0; border-top: none; padding: 24px; border-radius: 0 0 12px 12px;">
      <p>Hi ${esc(opts.employeeName)},</p>
      <p>Your performance evaluation for <strong>${esc(
        opts.monthLabel
      )}</strong> has been recorded by ${esc(opts.evaluatorName)}.</p>
      ${overallBlock}
      ${metricsBlock}
      ${growBlock}
      <p style="margin: 24px 0 8px;">Review it in the app, then confirm or raise any concerns:</p>
      <p style="margin: 4px 0 20px;">
        <a href="${opts.reviewUrl}" style="background: #2E6BE6; color: #fff; text-decoration: none; padding: 10px 20px; border-radius: 8px; font-weight: 600;">Review your evaluation</a>
      </p>
      <p style="color: #5A6B7B; font-size: 13px;">If the button doesn't work, paste this link into your browser:<br>${opts.reviewUrl}</p>
    </div>
  </div>`;
  return { subject, html };
}
