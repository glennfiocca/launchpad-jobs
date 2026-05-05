// ---------------------------------------------------------------------------
// email-templates.ts — Production email template system for Pipeline
//
// Self-contained module. Every template returns { subject, html } and shares
// a common base layout with logo, header, and footer. All CSS is inlined for
// maximum email-client compatibility (table-based layout, no classes).
// ---------------------------------------------------------------------------

const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

const LOGO_URL = `${APP_URL}/pipeline-logo.png`;

// ---- Shared types ---------------------------------------------------------

export interface EmailResult {
  subject: string;
  html: string;
}

export interface MagicLinkEmailParams {
  url: string;
}

export interface EmailChangeVerifyEmailParams {
  newEmail: string;
  confirmUrl: string;
}

export interface EmailChangeNoticeEmailParams {
  newEmail: string;
  supportEmail?: string;
}

export interface ApplicationConfirmationEmailParams {
  userName: string;
  jobTitle: string;
  companyName: string;
  dashboardUrl: string;
}

export interface InstantNotificationEmailParams {
  userName: string;
  title: string;
  body?: string;
  ctaUrl?: string;
  ctaLabel?: string;
  /** One-click unsubscribe URL (RFC 8058). When omitted, no unsubscribe block is rendered. */
  unsubscribeUrl?: string;
}

export interface NotificationDigestEmailParams {
  userName: string;
  unreadCount: number;
  preview: ReadonlyArray<{ title: string; body?: string }>;
  dashboardUrl: string;
  /** One-click unsubscribe URL (RFC 8058). When omitted, no unsubscribe block is rendered. */
  unsubscribeUrl?: string;
}

export interface StatusUpdateEmailParams {
  userName: string;
  jobTitle: string;
  companyName: string;
  newStatus: string;
  statusLabel: string;
  dashboardUrl: string;
  /** One-click unsubscribe URL (RFC 8058). When omitted, no unsubscribe block is rendered. */
  unsubscribeUrl?: string;
}

export interface ContactFormAdminEmailParams {
  name: string;
  email: string;
  category: string;
  pageUrl?: string;
  message: string;
  ipAddress?: string;
  userId?: string;
  createdAt: Date;
}

export interface ContactFormAdminEmailResult extends EmailResult {
  /** Plaintext fallback for clients that prefer text/plain over HTML. */
  text: string;
}

// ---- Utilities (self-contained) -------------------------------------------

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// ---- Accent color mapping -------------------------------------------------

type AccentPalette = {
  bg: string;
  border: string;
  text: string;
  badge: string;
};

function statusAccent(status: string): AccentPalette {
  switch (status) {
    case "OFFER":
      return { bg: "#f0fdf4", border: "#bbf7d0", text: "#166534", badge: "#16a34a" };
    case "REVIEWING":
    case "PHONE_SCREEN":
      return { bg: "#eff6ff", border: "#bfdbfe", text: "#1d4ed8", badge: "#2563eb" };
    case "INTERVIEWING":
      return { bg: "#fffbeb", border: "#fde68a", text: "#92400e", badge: "#d97706" };
    case "REJECTED":
      return { bg: "#fef2f2", border: "#fecaca", text: "#991b1b", badge: "#dc2626" };
    case "WITHDRAWN":
    case "LISTING_REMOVED":
    default:
      return { bg: "#f8fafc", border: "#e2e8f0", text: "#475569", badge: "#64748b" };
  }
}

// ---- Shared CTA button ----------------------------------------------------

function ctaButton(href: string, label: string, bgColor: string = "#2563eb"): string {
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin: 0 auto;">
      <tr>
        <td align="center" style="border-radius: 8px; background-color: ${bgColor};">
          <a href="${escapeHtml(href)}"
             target="_blank"
             style="display: inline-block; padding: 14px 28px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 15px; font-weight: 700; color: #ffffff; text-decoration: none; border-radius: 8px; mso-padding-alt: 0;">
            <!--[if mso]><i style="mso-font-width: -100%; mso-text-raise: 21pt;">&nbsp;</i><![endif]-->
            <span style="mso-text-raise: 10pt;">${escapeHtml(label)}</span>
            <!--[if mso]><i style="mso-font-width: -100%;">&nbsp;</i><![endif]-->
          </a>
        </td>
      </tr>
    </table>`;
}

// ---- Base layout ----------------------------------------------------------

interface FooterOptions {
  settingsUrl?: string;
  /** When provided, renders an inline one-click unsubscribe block above the standard footer. */
  unsubscribeUrl?: string;
}

/** Wraps body content in a responsive, email-safe outer shell with logo + footer. */
function baseLayout(content: string, footerOptions?: FooterOptions): string {
  const settingsUrl = footerOptions?.settingsUrl ?? `${APP_URL}/settings/notifications`;
  const unsubscribeUrl = footerOptions?.unsubscribeUrl;

  // Inline unsubscribe block — only rendered when caller provides a URL
  // (transactional notifications tied to a userId; not magic-link/auth emails).
  const unsubscribeBlock = unsubscribeUrl
    ? `
          <tr>
            <td style="padding: 0 40px;">
              <hr style="border:0;border-top:1px solid #e5e7eb;margin:24px 0">
              <p style="color:#6b7280;font-size:12px;font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
                Don't want these? <a href="${escapeHtml(unsubscribeUrl)}" style="color:#6b7280;text-decoration:underline;">Unsubscribe with one click</a>
                or <a href="${escapeHtml(settingsUrl)}" style="color:#6b7280;text-decoration:underline;">manage your preferences</a>.
              </p>
            </td>
          </tr>`
    : "";

  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <meta name="x-apple-disable-message-reformatting" />
  <meta name="color-scheme" content="light" />
  <meta name="supported-color-schemes" content="light" />
  <title>Pipeline</title>
  <!--[if mso]>
  <noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript>
  <![endif]-->
</head>
<body style="margin: 0; padding: 0; background-color: #f4f4f5; -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%;">

  <!-- Outer wrapper -->
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color: #f4f4f5;">
    <tr>
      <td align="center" style="padding: 32px 16px;">

        <!-- Inner container -->
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width: 600px; width: 100%; background-color: #ffffff; border-radius: 12px; border: 1px solid #e4e4e7; box-shadow: 0 1px 3px rgba(0,0,0,0.06);">

          <!-- Header: Logo -->
          <tr>
            <td align="center" style="padding: 32px 40px 20px 40px;">
              <img src="${LOGO_URL}" alt="Pipeline" width="140" style="display: block; width: 140px; height: auto; border: 0;" />
            </td>
          </tr>

          <!-- Header divider -->
          <tr>
            <td style="padding: 0 40px;">
              <div style="border-top: 1px solid #e4e4e7; height: 0; font-size: 0; line-height: 0;">&nbsp;</div>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding: 28px 40px 32px 40px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 15px; line-height: 1.6; color: #334155;">
              ${content}
            </td>
          </tr>
          ${unsubscribeBlock}

          <!-- Footer -->
          <tr>
            <td style="background-color: #f8fafc; border-radius: 0 0 12px 12px; padding: 24px 40px; border-top: 1px solid #e4e4e7;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td align="center" style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 12px; line-height: 1.5; color: #94a3b8;">
                    <p style="margin: 0 0 8px 0; font-weight: 600; color: #64748b;">Pipeline</p>
                    <p style="margin: 0 0 4px 0;">One-click job applications, automated tracking.</p>
                    <p style="margin: 0;">
                      <a href="${escapeHtml(settingsUrl)}" style="color: #94a3b8; text-decoration: underline;">Notification settings</a>
                      &nbsp;&middot;&nbsp;
                      <a href="${APP_URL}" style="color: #94a3b8; text-decoration: underline;">trypipeline.ai</a>
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

        </table>
        <!-- /Inner container -->

      </td>
    </tr>
  </table>
  <!-- /Outer wrapper -->

</body>
</html>`;
}

// ---- Template functions ---------------------------------------------------

export function emailChangeVerifyEmail(
  params: EmailChangeVerifyEmailParams,
): EmailResult {
  const { newEmail, confirmUrl } = params;

  const content = `
    <h1 style="margin: 0 0 8px 0; font-size: 22px; font-weight: 700; color: #0f172a; line-height: 1.3;">
      Confirm your new Pipeline email
    </h1>
    <p style="margin: 0 0 24px 0; color: #334155;">
      Click the button below to confirm <strong>${escapeHtml(newEmail)}</strong> as the email for your Pipeline account. This link expires in 1 hour.
    </p>

    ${ctaButton(confirmUrl, "Confirm email change")}

    <p style="margin: 28px 0 0 0; font-size: 13px; color: #94a3b8; text-align: center;">
      If you didn't request this email, you can safely ignore it.
    </p>`;

  return {
    subject: "Confirm your new Pipeline email",
    html: baseLayout(content),
  };
}

export function emailChangeNoticeEmail(
  params: EmailChangeNoticeEmailParams,
): EmailResult {
  const { newEmail, supportEmail = "support@trypipeline.ai" } = params;

  const content = `
    <h1 style="margin: 0 0 8px 0; font-size: 22px; font-weight: 700; color: #0f172a; line-height: 1.3;">
      Pipeline email change requested
    </h1>
    <p style="margin: 0 0 16px 0; color: #334155;">
      Someone — likely you — asked to change the email on your Pipeline account to <strong>${escapeHtml(newEmail)}</strong>.
    </p>
    <p style="margin: 0 0 16px 0; color: #334155;">
      If this was you, no further action is needed here. The confirmation link was sent to the new address.
    </p>
    <p style="margin: 0; color: #334155;">
      If this <strong>wasn't</strong> you, contact <a href="mailto:${escapeHtml(supportEmail)}" style="color:#2563eb;text-decoration:underline;">${escapeHtml(supportEmail)}</a> immediately to secure your account.
    </p>`;

  return {
    subject: "Pipeline email change requested",
    html: baseLayout(content),
  };
}

export function magicLinkEmail(params: MagicLinkEmailParams): EmailResult {
  const { url } = params;

  const content = `
    <h1 style="margin: 0 0 8px 0; font-size: 22px; font-weight: 700; color: #0f172a; line-height: 1.3;">
      Sign in to Pipeline
    </h1>
    <p style="margin: 0 0 24px 0; color: #334155;">
      Click the button below to sign in to your account. This link expires in 24 hours.
    </p>

    ${ctaButton(url, "Sign In")}

    <p style="margin: 28px 0 0 0; font-size: 13px; color: #94a3b8; text-align: center;">
      If you didn't request this email, you can safely ignore it.
    </p>`;

  return {
    subject: "Sign in to Pipeline",
    html: baseLayout(content),
  };
}

export function applicationConfirmationEmail(
  params: ApplicationConfirmationEmailParams,
): EmailResult {
  const { userName, jobTitle, companyName, dashboardUrl } = params;

  const content = `
    <h1 style="margin: 0 0 8px 0; font-size: 22px; font-weight: 700; color: #0f172a; line-height: 1.3;">
      Application Submitted
    </h1>
    <p style="margin: 0 0 24px 0; color: #334155;">
      Hi ${escapeHtml(userName)}, your application has been submitted successfully.
    </p>

    <!-- Success box -->
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom: 24px;">
      <tr>
        <td style="background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 10px; padding: 20px;">
          <p style="margin: 0 0 6px 0; font-size: 16px; font-weight: 700; color: #166534;">
            ${escapeHtml(jobTitle)}
          </p>
          <p style="margin: 0 0 12px 0; font-size: 14px; color: #15803d;">
            ${escapeHtml(companyName)}
          </p>
          <p style="margin: 0; font-size: 13px; color: #15803d; line-height: 1.5;">
            We'll track recruiter replies and update your dashboard automatically.
          </p>
        </td>
      </tr>
    </table>

    ${ctaButton(dashboardUrl, "View Application Dashboard", "#16a34a")}`;

  return {
    subject: `Application submitted: ${jobTitle} at ${companyName}`,
    html: baseLayout(content),
  };
}

export function instantNotificationEmail(
  params: InstantNotificationEmailParams,
): EmailResult {
  const { userName, title, body, ctaUrl, ctaLabel = "View Dashboard", unsubscribeUrl } = params;
  const dest = ctaUrl ?? `${APP_URL}/dashboard`;

  // Strip CRLF from subject to prevent SMTP header injection
  const safeSubject = title.replace(/[\r\n]+/g, " ");

  const bodyBlock = body
    ? `<p style="margin: 0 0 24px 0; color: #334155;">${escapeHtml(body)}</p>`
    : "";

  const content = `
    <p style="margin: 0 0 16px 0; color: #334155;">
      Hi ${escapeHtml(userName)},
    </p>

    <h1 style="margin: 0 0 12px 0; font-size: 20px; font-weight: 700; color: #0f172a; line-height: 1.3;">
      ${escapeHtml(title)}
    </h1>

    ${bodyBlock}

    ${ctaButton(dest, ctaLabel)}`;

  return {
    subject: safeSubject,
    html: baseLayout(content, {
      settingsUrl: `${APP_URL}/settings/notifications`,
      unsubscribeUrl,
    }),
  };
}

export function notificationDigestEmail(
  params: NotificationDigestEmailParams,
): EmailResult {
  const { userName, unreadCount, preview, dashboardUrl, unsubscribeUrl } = params;

  const rows = preview
    .map((n, idx) => {
      // Separator between rows (skip before first)
      const separator =
        idx > 0
          ? `<tr><td style="padding: 0;"><div style="border-top: 1px solid #e2e8f0; height: 0; font-size: 0; line-height: 0;">&nbsp;</div></td></tr>`
          : "";

      const bodyLine = n.body
        ? `<p style="margin: 4px 0 0 0; font-size: 13px; color: #64748b; line-height: 1.4;">${escapeHtml(n.body)}</p>`
        : "";

      return `${separator}
        <tr>
          <td style="padding: 14px 0;">
            <p style="margin: 0; font-size: 14px; font-weight: 600; color: #1e293b; line-height: 1.4;">
              ${escapeHtml(n.title)}
            </p>
            ${bodyLine}
          </td>
        </tr>`;
    })
    .join("");

  const plural = unreadCount === 1 ? "" : "s";

  const content = `
    <h1 style="margin: 0 0 8px 0; font-size: 20px; font-weight: 700; color: #0f172a; line-height: 1.3;">
      Hi ${escapeHtml(userName)}, you have ${unreadCount} new update${plural}
    </h1>
    <p style="margin: 0 0 24px 0; color: #334155;">
      Here's what's happened with your applications:
    </p>

    <!-- Notification cards -->
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 4px 20px; margin-bottom: 24px;">
      ${rows}
    </table>

    ${ctaButton(dashboardUrl, "View All Updates")}`;

  return {
    subject: `You have ${unreadCount} new notification${plural} on Pipeline`,
    html: baseLayout(content, {
      settingsUrl: `${APP_URL}/settings/notifications`,
      unsubscribeUrl,
    }),
  };
}

// Admin-facing notification for a /contact form submission.
// HTML body is built entirely from `escapeHtml`-wrapped values — never inline
// raw user input into a template literal. Plaintext fallback is for clients
// that prefer text/plain (most modern clients prefer HTML when both exist).
export function contactFormAdminEmail(
  params: ContactFormAdminEmailParams,
): ContactFormAdminEmailResult {
  const {
    name,
    email,
    category,
    pageUrl,
    message,
    ipAddress,
    userId,
    createdAt,
  } = params;

  const safeSubject = `[Pipeline contact / ${category}] ${name}`.replace(
    /[\r\n]+/g,
    " ",
  );
  const isoTimestamp = createdAt.toISOString();

  // Render the message as escaped HTML with line breaks preserved.
  const messageHtml = escapeHtml(message).replace(/\n/g, "<br />");

  const pageUrlBlock = pageUrl
    ? `
        <tr>
          <td style="padding: 6px 0; font-size: 13px; color: #64748b; width: 100px; vertical-align: top;">Page URL</td>
          <td style="padding: 6px 0; font-size: 13px; color: #0f172a; vertical-align: top;">
            <a href="${escapeHtml(pageUrl)}" style="color: #2563eb; text-decoration: underline; word-break: break-all;">${escapeHtml(pageUrl)}</a>
          </td>
        </tr>`
    : "";

  const triageRows = [
    userId ? `User ID: ${escapeHtml(userId)}` : "User ID: (anonymous)",
    ipAddress ? `IP: ${escapeHtml(ipAddress)}` : "IP: (unknown)",
    `Received: ${escapeHtml(isoTimestamp)}`,
  ].join(" &middot; ");

  const content = `
    <h1 style="margin: 0 0 8px 0; font-size: 20px; font-weight: 700; color: #0f172a; line-height: 1.3;">
      New /contact submission
    </h1>
    <p style="margin: 0 0 24px 0; color: #475569; font-size: 14px;">
      Reply directly to this email to respond — Reply-To is set to the sender's address.
    </p>

    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 16px 20px; margin-bottom: 20px;">
      <tr>
        <td style="padding: 6px 0; font-size: 13px; color: #64748b; width: 100px; vertical-align: top;">From</td>
        <td style="padding: 6px 0; font-size: 13px; color: #0f172a; vertical-align: top;">
          <strong>${escapeHtml(name)}</strong>
          &lt;<a href="mailto:${escapeHtml(email)}" style="color: #2563eb; text-decoration: underline;">${escapeHtml(email)}</a>&gt;
        </td>
      </tr>
      <tr>
        <td style="padding: 6px 0; font-size: 13px; color: #64748b; width: 100px; vertical-align: top;">Category</td>
        <td style="padding: 6px 0; font-size: 13px; color: #0f172a; vertical-align: top;">${escapeHtml(category)}</td>
      </tr>
      ${pageUrlBlock}
    </table>

    <div style="background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 10px; padding: 18px 20px; margin-bottom: 20px;">
      <p style="margin: 0 0 10px 0; font-size: 12px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px;">Message</p>
      <p style="margin: 0; font-size: 14px; color: #0f172a; line-height: 1.55; white-space: pre-wrap;">${messageHtml}</p>
    </div>

    <p style="margin: 0; font-size: 11px; color: #94a3b8; line-height: 1.5;">
      ${triageRows}
    </p>`;

  // Plaintext fallback — keep all values escaped/clean of CR/LF for header safety.
  const text = [
    `New /contact submission`,
    ``,
    `From: ${name} <${email}>`,
    `Category: ${category}`,
    pageUrl ? `Page URL: ${pageUrl}` : null,
    ``,
    `Message:`,
    message,
    ``,
    `--`,
    `User ID: ${userId ?? "(anonymous)"}`,
    `IP: ${ipAddress ?? "(unknown)"}`,
    `Received: ${isoTimestamp}`,
  ]
    .filter((line): line is string => line !== null)
    .join("\n");

  return {
    subject: safeSubject,
    html: baseLayout(content),
    text,
  };
}

export function statusUpdateEmail(
  params: StatusUpdateEmailParams,
): EmailResult {
  const { userName, jobTitle, companyName, newStatus, statusLabel, dashboardUrl, unsubscribeUrl } = params;

  const accent = statusAccent(newStatus);

  const content = `
    <h1 style="margin: 0 0 8px 0; font-size: 22px; font-weight: 700; color: #0f172a; line-height: 1.3;">
      Application Update
    </h1>
    <p style="margin: 0 0 24px 0; color: #334155;">
      Hi ${escapeHtml(userName)}, the status of your application has changed.
    </p>

    <!-- Status badge + job details -->
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom: 24px;">
      <tr>
        <td style="background-color: ${accent.bg}; border: 1px solid ${accent.border}; border-radius: 10px; padding: 20px;">
          <!-- Badge -->
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-bottom: 14px;">
            <tr>
              <td style="background-color: ${accent.badge}; border-radius: 6px; padding: 6px 14px;">
                <span style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 13px; font-weight: 700; color: #ffffff; text-transform: uppercase; letter-spacing: 0.5px;">
                  ${escapeHtml(statusLabel)}
                </span>
              </td>
            </tr>
          </table>

          <p style="margin: 0 0 4px 0; font-size: 16px; font-weight: 700; color: ${accent.text};">
            ${escapeHtml(jobTitle)}
          </p>
          <p style="margin: 0; font-size: 14px; color: ${accent.text};">
            ${escapeHtml(companyName)}
          </p>
        </td>
      </tr>
    </table>

    ${ctaButton(dashboardUrl, "View Dashboard")}`;

  return {
    subject: `Application update: ${jobTitle} at ${companyName}`,
    html: baseLayout(content, {
      settingsUrl: `${APP_URL}/settings/notifications`,
      unsubscribeUrl,
    }),
  };
}

// ---------------------------------------------------------------------------
// Sync digest (C.4) — daily 09:00 UTC summary of the prior 24h of syncs.
// Recipients: every User WHERE role = 'ADMIN'. Built on the same Resend
// transport as other transactional admin mail (see scripts/sync-digest.ts).
// ---------------------------------------------------------------------------

export interface SyncDigestFailureRow {
  boardToken: string;
  boardName: string;
  errors: ReadonlyArray<string>;
  startedAt: Date;
}

export interface SyncDigestData {
  /** ISO date (YYYY-MM-DD) of the digest "for" date — the day being reported on. */
  reportDate: string;
  windowStart: Date;
  windowEnd: Date;
  totalRuns: number;
  successes: number;
  partialFailures: number;
  failures: number;
  totalAdded: number;
  totalUpdated: number;
  totalDeactivated: number;
  averageDurationMs: number | null;
  /** Up to N most recent board-level failures (boardToken + first error). */
  failureSamples: ReadonlyArray<SyncDigestFailureRow>;
  adminDashboardUrl: string;
}

export interface SyncDigestEmailResult extends EmailResult {
  text: string;
}

function formatDuration(ms: number | null): string {
  if (ms === null) return "—";
  if (ms < 1000) return `${ms}ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const minutes = Math.floor(seconds / 60);
  const remSeconds = Math.round(seconds % 60);
  return `${minutes}m ${remSeconds}s`;
}

export function syncDigestEmail(
  data: SyncDigestData,
): SyncDigestEmailResult {
  const {
    reportDate,
    windowStart,
    windowEnd,
    totalRuns,
    successes,
    partialFailures,
    failures,
    totalAdded,
    totalUpdated,
    totalDeactivated,
    averageDurationMs,
    failureSamples,
    adminDashboardUrl,
  } = data;

  const noSyncs = totalRuns === 0;

  // Banner shown ONLY when zero sync runs landed in the 24h window — that's
  // a silent-failure signal worth flagging at the top of the email.
  const noSyncsBannerHtml = noSyncs
    ? `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin: 0 0 24px 0;">
      <tr>
        <td style="background-color: #fef2f2; border: 1px solid #fecaca; border-radius: 10px; padding: 16px 20px;">
          <p style="margin: 0; font-size: 14px; font-weight: 700; color: #991b1b;">
            NO SYNCS RAN in the last 24 hours
          </p>
          <p style="margin: 6px 0 0 0; font-size: 13px; color: #b91c1c; line-height: 1.5;">
            Expected at least 4 runs at the 6h cadence. Check DO scheduled job logs and the Healthchecks.io heartbeat.
          </p>
        </td>
      </tr>
    </table>`
    : "";

  const failuresBlockHtml =
    failures > 0 || partialFailures > 0
      ? `
    <h2 style="margin: 24px 0 12px 0; font-size: 16px; font-weight: 700; color: #0f172a;">
      Recent failures
    </h2>
    <div style="background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 10px; padding: 16px 20px;">
      ${
        failureSamples.length === 0
          ? `<p style="margin: 0; font-size: 13px; color: #64748b;">Failures aggregated but no per-board error samples available.</p>`
          : failureSamples
              .map((row) => {
                const firstError = row.errors[0] ?? "(no error message)";
                return `
        <p style="margin: 0 0 8px 0; font-size: 13px; color: #0f172a; line-height: 1.5;">
          <strong>${escapeHtml(row.boardName)}</strong>
          <span style="color: #64748b;">(${escapeHtml(row.boardToken)})</span>
          <span style="color: #94a3b8;"> — ${escapeHtml(row.startedAt.toISOString())}</span>
          <br />
          <span style="color: #b91c1c; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, monospace; font-size: 12px;">${escapeHtml(firstError)}</span>
        </p>`;
              })
              .join("")
      }
    </div>`
      : "";

  const summaryCellStyle =
    "padding: 14px 16px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;";

  const content = `
    <h1 style="margin: 0 0 8px 0; font-size: 22px; font-weight: 700; color: #0f172a; line-height: 1.3;">
      Daily sync digest
    </h1>
    <p style="margin: 0 0 24px 0; color: #475569; font-size: 14px;">
      Window: ${escapeHtml(windowStart.toISOString())} → ${escapeHtml(windowEnd.toISOString())}
    </p>

    ${noSyncsBannerHtml}

    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; margin-bottom: 16px;">
      <tr>
        <td style="${summaryCellStyle} font-size: 13px; color: #64748b; border-bottom: 1px solid #e2e8f0;">Runs</td>
        <td style="${summaryCellStyle} font-size: 13px; color: #0f172a; border-bottom: 1px solid #e2e8f0; text-align: right;">
          <strong>${totalRuns}</strong>
          <span style="color: #16a34a;"> ${successes} ok</span>
          ${partialFailures > 0 ? ` <span style="color: #d97706;">/ ${partialFailures} partial</span>` : ""}
          ${failures > 0 ? ` <span style="color: #dc2626;">/ ${failures} failed</span>` : ""}
        </td>
      </tr>
      <tr>
        <td style="${summaryCellStyle} font-size: 13px; color: #64748b; border-bottom: 1px solid #e2e8f0;">Jobs added</td>
        <td style="${summaryCellStyle} font-size: 13px; color: #0f172a; border-bottom: 1px solid #e2e8f0; text-align: right;"><strong>+${totalAdded}</strong></td>
      </tr>
      <tr>
        <td style="${summaryCellStyle} font-size: 13px; color: #64748b; border-bottom: 1px solid #e2e8f0;">Jobs updated</td>
        <td style="${summaryCellStyle} font-size: 13px; color: #0f172a; border-bottom: 1px solid #e2e8f0; text-align: right;">~${totalUpdated}</td>
      </tr>
      <tr>
        <td style="${summaryCellStyle} font-size: 13px; color: #64748b; border-bottom: 1px solid #e2e8f0;">Jobs deactivated</td>
        <td style="${summaryCellStyle} font-size: 13px; color: #0f172a; border-bottom: 1px solid #e2e8f0; text-align: right;">-${totalDeactivated}</td>
      </tr>
      <tr>
        <td style="${summaryCellStyle} font-size: 13px; color: #64748b;">Avg duration</td>
        <td style="${summaryCellStyle} font-size: 13px; color: #0f172a; text-align: right;">${escapeHtml(formatDuration(averageDurationMs))}</td>
      </tr>
    </table>

    ${failuresBlockHtml}

    <div style="margin-top: 28px;">
      ${ctaButton(adminDashboardUrl, "Open admin sync dashboard")}
    </div>`;

  // Plaintext fallback — keep it short, no HTML tags. Used by clients that
  // prefer text/plain (rare, but free reliability win).
  const textLines: string[] = [
    `Daily sync digest — ${reportDate}`,
    `Window: ${windowStart.toISOString()} → ${windowEnd.toISOString()}`,
    "",
  ];
  if (noSyncs) {
    textLines.push("WARNING: NO SYNCS RAN in the last 24 hours.");
    textLines.push("");
  }
  textLines.push(
    `Runs: ${totalRuns} (${successes} ok, ${partialFailures} partial, ${failures} failed)`,
    `Jobs added:       +${totalAdded}`,
    `Jobs updated:     ~${totalUpdated}`,
    `Jobs deactivated: -${totalDeactivated}`,
    `Avg duration:     ${formatDuration(averageDurationMs)}`,
  );
  if (failureSamples.length > 0) {
    textLines.push("", "Recent failures:");
    for (const row of failureSamples) {
      const firstError = row.errors[0] ?? "(no error message)";
      textLines.push(
        `  - ${row.boardName} (${row.boardToken}) @ ${row.startedAt.toISOString()}`,
        `      ${firstError}`,
      );
    }
  }
  textLines.push("", `Dashboard: ${adminDashboardUrl}`);

  return {
    subject: `[Pipeline] Daily sync digest — ${reportDate}`,
    html: baseLayout(content, {
      settingsUrl: `${APP_URL}/admin/sync`,
    }),
    text: textLines.join("\n"),
  };
}
