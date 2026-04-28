import { Resend } from "resend";
import {
  applicationConfirmationEmail,
  instantNotificationEmail,
  notificationDigestEmail,
  statusUpdateEmail,
} from "@/lib/email-templates";

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
  dashboardUrl,
}: {
  to: string;
  userName: string;
  jobTitle: string;
  companyName: string;
  dashboardUrl: string;
}) {
  const { subject, html } = applicationConfirmationEmail({
    userName,
    jobTitle,
    companyName,
    dashboardUrl,
  });

  return getResend().emails.send({
    from: FROM_ADDRESS,
    to,
    subject,
    html,
  });
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
  const { subject, html } = instantNotificationEmail({
    userName,
    title,
    body,
    ctaUrl,
    ctaLabel,
  });

  return getResend().emails.send({
    from: FROM_ADDRESS,
    to,
    subject,
    html,
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
  const { subject, html } = notificationDigestEmail({
    userName,
    unreadCount,
    preview,
    dashboardUrl,
  });

  return getResend().emails.send({
    from: FROM_ADDRESS,
    to,
    subject,
    html,
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
  const { subject, html } = statusUpdateEmail({
    userName,
    jobTitle,
    companyName,
    newStatus,
    statusLabel,
    dashboardUrl,
  });

  return getResend().emails.send({
    from: FROM_ADDRESS,
    to,
    subject,
    html,
  });
}
