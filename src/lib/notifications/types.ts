import { z } from "zod";
import type {
  NotificationType,
  NotificationPriority,
  EmailFrequency,
  ApplicationStatus,
  NotificationPreference,
} from "@prisma/client";

export type { NotificationType, NotificationPriority, EmailFrequency };

// Typed payload per notification type
export type NotificationData =
  | {
      type: "APPLIED";
      applicationId: string;
      jobId: string;
      jobTitle: string;
      companyName: string;
    }
  | {
      type: "APPLICATION_STATUS_CHANGE";
      applicationId: string;
      fromStatus: ApplicationStatus | null;
      toStatus: ApplicationStatus;
      jobTitle: string;
      companyName: string;
    }
  | {
      type: "APPLICATION_OFFER";
      applicationId: string;
      fromStatus: ApplicationStatus | null;
      toStatus: "OFFER";
      jobTitle: string;
      companyName: string;
    }
  | {
      type: "APPLICATION_INTERVIEW";
      applicationId: string;
      fromStatus: ApplicationStatus | null;
      toStatus: "PHONE_SCREEN" | "INTERVIEWING";
      jobTitle: string;
      companyName: string;
    }
  | {
      type: "APPLICATION_REJECTED";
      applicationId: string;
      fromStatus: ApplicationStatus | null;
      toStatus: "REJECTED";
      jobTitle: string;
      companyName: string;
    }
  | {
      type: "EMAIL_RECEIVED";
      applicationId: string;
      emailId: string;
      subject: string;
      from: string;
      jobTitle: string;
      companyName: string;
    }
  | {
      type: "LISTING_REMOVED";
      applicationId: string;
      jobId: string;
      jobTitle: string;
      companyName: string;
    }
  | {
      type: "APPLY_FAILED";
      applicationId: string;
      jobId: string;
      jobTitle: string;
      companyName: string;
      error: string;
    }
  | {
      type: "TEAM_MESSAGE";
      broadcastId?: string;
    }
  | {
      type: "SYSTEM";
      category?: string;
    };

export interface CreateNotificationInput {
  userId: string;
  type: NotificationType;
  title: string;
  body?: string;
  priority?: NotificationPriority;
  ctaUrl?: string;
  ctaLabel?: string;
  applicationId?: string;
  jobId?: string;
  data?: NotificationData;
  dedupeKey?: string;
  suppressEmail?: boolean;
  forceEmail?: boolean;
}

export interface NotificationListOptions {
  cursor?: string;
  limit?: number;
  unreadOnly?: boolean;
}

// Narrowly typed union of boolean columns in NotificationPreference
// Prevents accidental use of non-boolean fields in email routing
export type BooleanPrefField = {
  [K in keyof NotificationPreference]: NotificationPreference[K] extends boolean
    ? K
    : never;
}[keyof NotificationPreference];

// Zod schema for API validation
export const CreateNotificationSchema = z.object({
  userId: z.string().min(1),
  type: z.enum([
    "APPLIED",
    "APPLICATION_STATUS_CHANGE",
    "APPLICATION_OFFER",
    "APPLICATION_INTERVIEW",
    "APPLICATION_REJECTED",
    "EMAIL_RECEIVED",
    "LISTING_REMOVED",
    "APPLY_FAILED",
    "TEAM_MESSAGE",
    "SYSTEM",
  ]),
  title: z.string().min(1).max(200),
  body: z.string().max(1000).optional(),
  // Only relative paths or https:// URLs allowed — prevents javascript: injection
  ctaUrl: z
    .string()
    .max(500)
    .refine(
      (v) => v.startsWith("/") || v.startsWith("https://"),
      "ctaUrl must be a relative path or https:// URL"
    )
    .optional(),
  ctaLabel: z.string().max(100).optional(),
  applicationId: z.string().optional(),
  jobId: z.string().optional(),
});

// Priority by type — CRITICAL always emails regardless of prefs
export const TYPE_PRIORITY: Record<NotificationType, NotificationPriority> = {
  APPLIED: "LOW",
  APPLICATION_STATUS_CHANGE: "NORMAL",
  APPLICATION_OFFER: "CRITICAL",
  APPLICATION_INTERVIEW: "HIGH",
  APPLICATION_REJECTED: "NORMAL",
  EMAIL_RECEIVED: "LOW",
  LISTING_REMOVED: "LOW",
  APPLY_FAILED: "HIGH",
  TEAM_MESSAGE: "NORMAL",
  SYSTEM: "HIGH",
};

// Which preference field controls email for a given type
export const TYPE_EMAIL_PREF_FIELD: Record<
  NotificationType,
  BooleanPrefField | null
> = {
  APPLIED: null, // suppress by default — confirmation email already sent
  APPLICATION_STATUS_CHANGE: "emailOnStatusChange",
  APPLICATION_OFFER: "emailOnOffer",
  APPLICATION_INTERVIEW: "emailOnInterview",
  APPLICATION_REJECTED: "emailOnStatusChange",
  EMAIL_RECEIVED: "emailOnEmailReceived",
  LISTING_REMOVED: "emailOnListingRemoved",
  APPLY_FAILED: "emailOnApplyFailed",
  TEAM_MESSAGE: "emailOnTeamMessage",
  SYSTEM: "emailOnSystem",
};
