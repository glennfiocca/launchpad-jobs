import { Resend } from "resend";
import {
  applicationConfirmationEmail,
  contactFormAdminEmail,
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

// Default destination for /contact submissions. Overridable via env so we can
// route privacy-tagged messages to a separate inbox later without a deploy.
const CONTACT_FORM_FALLBACK = "support@trypipeline.ai";

export interface SendContactFormToAdminPayload {
  name: string;
  email: string;
  category: string;
  pageUrl?: string;
  message: string;
  ipAddress?: string;
  userId?: string;
  createdAt: Date;
}

export interface SendContactFormToAdminResult {
  ok: boolean;
  error?: string;
}

// Dispatch a /contact submission to the support inbox.
// Returns a result object instead of throwing — the caller decides whether
// to mark the row's deliveredAt. Reply-To is set to the submitter so admins
// can reply directly from their inbox without copying the address out.
export async function sendContactFormToAdmin(
  payload: SendContactFormToAdminPayload,
): Promise<SendContactFormToAdminResult> {
  const adminEmail =
    process.env.CONTACT_FORM_TO?.trim() || CONTACT_FORM_FALLBACK;

  const { subject, html, text } = contactFormAdminEmail(payload);

  try {
    const result = await getResend().emails.send({
      from: FROM_ADDRESS,
      to: [adminEmail],
      replyTo: payload.email,
      subject,
      html,
      text,
    });

    // Resend SDK returns { data, error } — `error` is non-null on failure.
    const sdkError = (result as { error?: { message?: string } | null }).error;
    if (sdkError) {
      return { ok: false, error: sdkError.message ?? "send failed" };
    }
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "send threw",
    };
  }
}

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
