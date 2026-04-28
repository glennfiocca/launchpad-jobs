// Generates HTML previews of all email templates — open in browser to review.
// Usage: npx tsx scripts/preview-emails.ts

import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import {
  magicLinkEmail,
  applicationConfirmationEmail,
  instantNotificationEmail,
  notificationDigestEmail,
  statusUpdateEmail,
} from "../src/lib/email-templates";

const OUT_DIR = join(__dirname, "..", "tmp", "email-previews");
mkdirSync(OUT_DIR, { recursive: true });

const templates = [
  {
    name: "01-magic-link",
    ...magicLinkEmail({ url: "https://trypipeline.ai/auth/verify?token=abc123" }),
  },
  {
    name: "02-application-confirmation",
    ...applicationConfirmationEmail({
      userName: "Glenn",
      jobTitle: "Senior Software Engineer",
      companyName: "Stripe",
      dashboardUrl: "https://trypipeline.ai/dashboard",
    }),
  },
  {
    name: "03-instant-notification",
    ...instantNotificationEmail({
      userName: "Glenn",
      title: "Interview scheduled at Stripe",
      body: "Your interview for Senior Software Engineer has been scheduled for Thursday, May 1st at 2:00 PM ET.",
      ctaUrl: "https://trypipeline.ai/dashboard/applications/123",
      ctaLabel: "View Details",
    }),
  },
  {
    name: "04-notification-digest",
    ...notificationDigestEmail({
      userName: "Glenn",
      unreadCount: 3,
      preview: [
        { title: "Application viewed: Frontend Engineer at Vercel", body: "Your application was viewed by the hiring team." },
        { title: "Status update: Senior SWE at Stripe", body: "Moved to Phone Screen stage." },
        { title: "New match: Staff Engineer at Linear", body: "95% match based on your profile." },
      ],
      dashboardUrl: "https://trypipeline.ai/dashboard",
    }),
  },
  {
    name: "05-status-update-offer",
    ...statusUpdateEmail({
      userName: "Glenn",
      jobTitle: "Senior Software Engineer",
      companyName: "Stripe",
      newStatus: "OFFER",
      statusLabel: "Offer Received",
      dashboardUrl: "https://trypipeline.ai/dashboard",
    }),
  },
  {
    name: "06-status-update-interview",
    ...statusUpdateEmail({
      userName: "Glenn",
      jobTitle: "Product Designer",
      companyName: "Figma",
      newStatus: "INTERVIEWING",
      statusLabel: "Interviewing",
      dashboardUrl: "https://trypipeline.ai/dashboard",
    }),
  },
  {
    name: "07-status-update-rejected",
    ...statusUpdateEmail({
      userName: "Glenn",
      jobTitle: "Backend Engineer",
      companyName: "Notion",
      newStatus: "REJECTED",
      statusLabel: "Not Moving Forward",
      dashboardUrl: "https://trypipeline.ai/dashboard",
    }),
  },
];

for (const t of templates) {
  const path = join(OUT_DIR, `${t.name}.html`);
  writeFileSync(path, t.html, "utf-8");
  console.log(`  ${t.name}.html  —  Subject: "${t.subject}"`);
}

console.log(`\n  ${templates.length} previews written to ${OUT_DIR}`);
console.log(`  Open in browser: open ${OUT_DIR}/01-magic-link.html`);
