import { Resend } from "resend";

// Lazy getter — avoids throwing at module load time when key is not yet set
function getResend() {
  return new Resend(process.env.RESEND_API_KEY ?? "re_placeholder");
}

export const FROM_ADDRESS = process.env.RESEND_FROM_EMAIL ?? "noreply@trypipeline.ai";
export const INBOUND_DOMAIN = process.env.RESEND_INBOUND_DOMAIN ?? "track.trypipeline.ai";

// Send application confirmation email
export async function sendApplicationConfirmation({
  to,
  userName,
  jobTitle,
  companyName,
  trackingEmail,
  dashboardUrl,
}: {
  to: string;
  userName: string;
  jobTitle: string;
  companyName: string;
  trackingEmail: string;
  dashboardUrl: string;
}) {
  return getResend().emails.send({
    from: FROM_ADDRESS,
    to,
    subject: `Application submitted: ${jobTitle} at ${companyName}`,
    html: `
      <div style="font-family: -apple-system, sans-serif; max-width: 520px; margin: 0 auto; padding: 24px; color: #0f172a;">
        <div style="margin-bottom: 24px;">
          <div style="display: inline-flex; align-items: center; gap: 8px; font-weight: 700; font-size: 18px; color: #0f172a;">
            🚀 Pipeline
          </div>
        </div>

        <h1 style="font-size: 22px; font-weight: 700; margin-bottom: 8px;">Application Submitted!</h1>
        <p style="color: #475569; margin-bottom: 24px;">
          Hi ${userName}, your application for <strong>${jobTitle}</strong> at <strong>${companyName}</strong> has been submitted.
        </p>

        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px; margin-bottom: 24px;">
          <p style="font-size: 12px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 8px;">
            Your Tracking Email
          </p>
          <p style="font-family: monospace; font-size: 13px; color: #1e293b; background: white; border: 1px solid #e2e8f0; border-radius: 6px; padding: 8px 12px; margin-bottom: 8px; word-break: break-all;">
            ${trackingEmail}
          </p>
          <p style="font-size: 12px; color: #94a3b8;">
            Forward any recruiting emails from ${companyName} to this address. We'll automatically track your application status.
          </p>
        </div>

        <a href="${dashboardUrl}" style="display: inline-block; background: #2563eb; color: white; padding: 12px 24px; border-radius: 10px; text-decoration: none; font-weight: 600; font-size: 14px;">
          View Application Dashboard →
        </a>

        <p style="color: #94a3b8; font-size: 12px; margin-top: 32px;">
          Pipeline — One-click job applications
        </p>
      </div>
    `,
  });
}

// Escape HTML entities to prevent XSS in email templates
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// Send an immediate single-notification email (for OFFER, INTERVIEW, HIGH priority)
export async function sendInstantNotificationEmail({
  to,
  userName,
  title,
  body,
  ctaUrl,
  ctaLabel = "View Dashboard",
}: {
  to: string;
  userName: string;
  title: string;
  body?: string;
  ctaUrl?: string;
  ctaLabel?: string;
}) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const dest = ctaUrl ?? `${appUrl}/dashboard`;

  // Strip CRLF from subject to prevent SMTP header injection
  const safeSubject = title.replace(/[\r\n]+/g, " ");

  return getResend().emails.send({
    from: FROM_ADDRESS,
    to,
    subject: safeSubject,
    html: `
      <div style="font-family: -apple-system, sans-serif; max-width: 520px; margin: 0 auto; padding: 24px; color: #0f172a;">
        <div style="margin-bottom: 24px;">
          <div style="font-weight: 700; font-size: 18px; color: #0f172a;">🚀 Pipeline</div>
        </div>
        <h1 style="font-size: 20px; font-weight: 700; margin-bottom: 8px;">${escapeHtml(title)}</h1>
        ${body ? `<p style="color: #475569; margin-bottom: 24px;">${escapeHtml(body)}</p>` : ""}
        <a href="${escapeHtml(dest)}" style="display: inline-block; background: #2563eb; color: white; padding: 12px 24px; border-radius: 10px; text-decoration: none; font-weight: 600; font-size: 14px;">
          ${escapeHtml(ctaLabel)} →
        </a>
        <p style="color: #94a3b8; font-size: 12px; margin-top: 32px;">
          You can manage your notification preferences in your <a href="${appUrl}/settings/notifications" style="color: #94a3b8;">account settings</a>.
        </p>
      </div>
    `,
  });
}

// Send a digest email summarising unread notifications
export async function sendNotificationDigest({
  to,
  userName,
  unreadCount,
  preview,
  dashboardUrl,
}: {
  to: string;
  userName: string;
  unreadCount: number;
  preview: Array<{ title: string; body?: string }>;
  dashboardUrl: string;
}) {
  const previewHtml = preview
    .map(
      (n) => `
        <div style="padding: 12px 0; border-bottom: 1px solid #e2e8f0;">
          <p style="font-size: 14px; font-weight: 600; color: #1e293b; margin: 0 0 4px;">${escapeHtml(n.title)}</p>
          ${n.body ? `<p style="font-size: 13px; color: #64748b; margin: 0;">${escapeHtml(n.body)}</p>` : ""}
        </div>`
    )
    .join("");

  return getResend().emails.send({
    from: FROM_ADDRESS,
    to,
    subject: `You have ${unreadCount} new notification${unreadCount === 1 ? "" : "s"} on Pipeline`,
    html: `
      <div style="font-family: -apple-system, sans-serif; max-width: 520px; margin: 0 auto; padding: 24px; color: #0f172a;">
        <div style="margin-bottom: 24px;">
          <div style="font-weight: 700; font-size: 18px; color: #0f172a;">🚀 Pipeline</div>
        </div>
        <h1 style="font-size: 20px; font-weight: 700; margin-bottom: 8px;">
          Hi ${escapeHtml(userName)}, you have ${unreadCount} new update${unreadCount === 1 ? "" : "s"}
        </h1>
        <p style="color: #475569; margin-bottom: 24px;">Here's what's happened with your applications:</p>
        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px; margin-bottom: 24px;">
          ${previewHtml}
        </div>
        <a href="${dashboardUrl}" style="display: inline-block; background: #2563eb; color: white; padding: 12px 24px; border-radius: 10px; text-decoration: none; font-weight: 600; font-size: 14px;">
          View all updates →
        </a>
        <p style="color: #94a3b8; font-size: 12px; margin-top: 32px;">
          Pipeline — One-click job applications<br>
          <a href="${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/settings/notifications" style="color: #94a3b8;">Manage notification preferences</a>
        </p>
      </div>
    `,
  });
}

// Send status update notification
export async function sendStatusUpdate({
  to,
  userName,
  jobTitle,
  companyName,
  newStatus,
  statusLabel,
  dashboardUrl,
}: {
  to: string;
  userName: string;
  jobTitle: string;
  companyName: string;
  newStatus: string;
  statusLabel: string;
  dashboardUrl: string;
}) {
  const statusEmoji: Record<string, string> = {
    REVIEWING: "👀",
    PHONE_SCREEN: "📞",
    INTERVIEWING: "🎯",
    OFFER: "🎉",
    REJECTED: "😔",
    WITHDRAWN: "↩️",
  };

  const emoji = statusEmoji[newStatus] ?? "📋";

  return getResend().emails.send({
    from: FROM_ADDRESS,
    to,
    subject: `${emoji} Application update: ${jobTitle} at ${companyName}`,
    html: `
      <div style="font-family: -apple-system, sans-serif; max-width: 520px; margin: 0 auto; padding: 24px; color: #0f172a;">
        <h1 style="font-size: 22px; font-weight: 700; margin-bottom: 8px;">${emoji} Status Update</h1>
        <p style="color: #475569; margin-bottom: 16px;">
          Hi ${userName}, your application status for <strong>${jobTitle}</strong> at <strong>${companyName}</strong> has been updated.
        </p>
        <div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 10px; padding: 16px; margin-bottom: 24px;">
          <p style="font-size: 14px; font-weight: 600; color: #1d4ed8;">${statusLabel}</p>
        </div>
        <a href="${dashboardUrl}" style="display: inline-block; background: #2563eb; color: white; padding: 12px 24px; border-radius: 10px; text-decoration: none; font-weight: 600; font-size: 14px;">
          View Dashboard →
        </a>
      </div>
    `,
  });
}
