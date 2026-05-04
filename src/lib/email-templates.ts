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
