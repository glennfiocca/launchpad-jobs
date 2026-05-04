import { Resend } from "resend";
import {
  applicationConfirmationEmail,
  emailChangeNoticeEmail,
  emailChangeVerifyEmail,
  instantNotificationEmail,
  notificationDigestEmail,
  statusUpdateEmail,
} from "@/lib/email-templates";
import {
  buildListUnsubscribeHeaders,
  buildUnsubscribeUrl,
} from "@/lib/unsubscribe-urls";
import type { UnsubscribeType } from "@/lib/unsubscribe-jwt";

// Lazy getter — avoids throwing at module load time when key is not yet set
function getResend() {
  return new Resend(process.env.RESEND_API_KEY ?? "re_placeholder");
}

export const FROM_ADDRESS = process.env.RESEND_FROM_EMAIL ?? "noreply@trypipeline.ai";
export const INBOUND_DOMAIN = process.env.RESEND_INBOUND_DOMAIN ?? "track.trypipeline.ai";

// Send application confirmation email
// Note: transactional — no unsubscribe headers per spec.
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
// Includes RFC 8058 List-Unsubscribe headers + footer link tied to userId/type.
export async function sendInstantNotificationEmail({
  to,
  userId,
  unsubscribeType,
  userName,
  title,
  body,
  ctaUrl,
  ctaLabel = "View Dashboard",
}: {
  to: string;
  userId: string;
  unsubscribeType: UnsubscribeType;
  userName: string;
  title: string;
  body?: string;
  ctaUrl?: string;
  ctaLabel?: string;
}) {
  const unsubscribeUrl = buildUnsubscribeUrl(userId, unsubscribeType);
  const headers = buildListUnsubscribeHeaders(userId, unsubscribeType);

  const { subject, html } = instantNotificationEmail({
    userName,
    title,
    body,
    ctaUrl,
    ctaLabel,
    unsubscribeUrl,
  });

  return getResend().emails.send({
    from: FROM_ADDRESS,
    to,
    subject,
    html,
    headers,
  });
}

// Send a digest email summarising unread notifications
// Digest unsubscribe targets the entire email channel (ALL).
export async function sendNotificationDigest({
  to,
  userId,
  userName,
  unreadCount,
  preview,
  dashboardUrl,
}: {
  to: string;
  userId: string;
  userName: string;
  unreadCount: number;
  preview: Array<{ title: string; body?: string }>;
  dashboardUrl: string;
}) {
  const unsubscribeUrl = buildUnsubscribeUrl(userId, "ALL");
  const headers = buildListUnsubscribeHeaders(userId, "ALL");

  const { subject, html } = notificationDigestEmail({
    userName,
    unreadCount,
    preview,
    dashboardUrl,
    unsubscribeUrl,
  });

  return getResend().emails.send({
    from: FROM_ADDRESS,
    to,
    subject,
    html,
    headers,
  });
}

// Send the email-change verification link to the prospective new address.
// Transactional — no unsubscribe headers (auth flow, not marketing).
export async function sendEmailChangeVerify({
  to,
  confirmUrl,
}: {
  to: string;
  confirmUrl: string;
}) {
  const { subject, html } = emailChangeVerifyEmail({
    newEmail: to,
    confirmUrl,
  });

  return getResend().emails.send({
    from: FROM_ADDRESS,
    to,
    subject,
    html,
  });
}

// Send a non-actionable notice to the OLD address so the rightful owner is
// alerted to a change in progress (defense against silent account theft).
export async function sendEmailChangeNotice({
  to,
  newEmail,
}: {
  to: string;
  newEmail: string;
}) {
  const { subject, html } = emailChangeNoticeEmail({ newEmail });

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
  userId,
  unsubscribeType,
  userName,
  jobTitle,
  companyName,
  newStatus,
  statusLabel,
  dashboardUrl,
}: {
  to: string;
  userId: string;
  unsubscribeType: UnsubscribeType;
  userName: string;
  jobTitle: string;
  companyName: string;
  newStatus: string;
  statusLabel: string;
  dashboardUrl: string;
}) {
  const unsubscribeUrl = buildUnsubscribeUrl(userId, unsubscribeType);
  const headers = buildListUnsubscribeHeaders(userId, unsubscribeType);

  const { subject, html } = statusUpdateEmail({
    userName,
    jobTitle,
    companyName,
    newStatus,
    statusLabel,
    dashboardUrl,
    unsubscribeUrl,
  });

  return getResend().emails.send({
    from: FROM_ADDRESS,
    to,
    subject,
    html,
    headers,
  });
}
