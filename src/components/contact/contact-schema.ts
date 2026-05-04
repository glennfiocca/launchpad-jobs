import { z } from "zod";

// Mirrors the server-side schema in src/app/api/contact/route.ts. Kept in a
// dedicated file so the form can import it without dragging server-only
// modules through the client bundle.

export const CONTACT_CATEGORIES = [
  "general",
  "privacy",
  "account",
  "bug",
  "other",
] as const;

export type ContactCategory = (typeof CONTACT_CATEGORIES)[number];

export const CONTACT_CATEGORY_LABELS: Record<ContactCategory, string> = {
  general: "General question",
  // Covers both general privacy concerns AND specific data-rights requests
  // (access / correction / deletion) per GDPR/CCPA. Backend value stays
  // "privacy" so existing rows and email routing are unaffected.
  privacy: "Privacy or data rights request",
  account: "Account issue",
  bug: "Bug report",
  other: "Other",
};

export const contactFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Please enter your name")
    .max(120, "Name is too long"),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("Enter a valid email address")
    .max(200, "Email is too long"),
  category: z.enum(CONTACT_CATEGORIES, { message: "Pick a category" }),
  pageUrl: z
    .string()
    .trim()
    .max(500, "URL is too long")
    .url("Enter a valid URL")
    .optional()
    .or(z.literal("")),
  message: z
    .string()
    .trim()
    .min(20, "Please add a bit more detail (at least 20 characters)")
    .max(5000, "Message is too long (5000 character max)"),
  // Honeypot — must be empty. Hidden from real users via aria-hidden + sr-only.
  website: z.string().max(0).optional(),
});

export type ContactFormValues = z.infer<typeof contactFormSchema>;
