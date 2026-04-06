import { Resend } from "resend";

if (!process.env.RESEND_API_KEY) {
  console.warn("RESEND_API_KEY not set — email features disabled");
}

export const resend = new Resend(process.env.RESEND_API_KEY ?? "");

export const FROM_ADDRESS = process.env.RESEND_FROM_EMAIL ?? "noreply@launchpad.jobs";
export const INBOUND_DOMAIN = process.env.RESEND_INBOUND_DOMAIN ?? "track.launchpad.jobs";

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
  return resend.emails.send({
    from: FROM_ADDRESS,
    to,
    subject: `Application submitted: ${jobTitle} at ${companyName}`,
    html: `
      <div style="font-family: -apple-system, sans-serif; max-width: 520px; margin: 0 auto; padding: 24px; color: #0f172a;">
        <div style="margin-bottom: 24px;">
          <div style="display: inline-flex; align-items: center; gap: 8px; font-weight: 700; font-size: 18px; color: #0f172a;">
            🚀 Launchpad
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
          Launchpad — One-click job applications
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

  return resend.emails.send({
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
