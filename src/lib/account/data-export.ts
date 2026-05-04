// Phase 4 — buildExportPayload(userId)
//
// Assembles a single self-contained JSON document containing the user's own
// data. PII scrubbing rules (locked decisions in the Phase 4 spec):
//
//   • Drop User.stripeCustomerId, all OAuth tokens (Account.access_token,
//     refresh_token, id_token), and the underlying stripeSubscriptionId.
//   • The referral history exposes only joinedAt + converted — never the
//     referee's userId or email.
//   • The user's own profile (UserProfile) is included verbatim — that's
//     the user's own data, not "other users".
//   • Resume binary (UserProfile.resumeData) is base64-encoded and included
//     ONLY if the resulting JSON stays under the 50 MB cap. If the final
//     serialized payload would exceed it, the caller (route handler) drops
//     the binary via stripResumeBinary() and re-serializes.
//
// Lists are sorted by createdAt ASC for stable output. Dates are serialized
// as ISO strings explicitly (we don't trust JSON.stringify's Date semantics).

import { db } from "@/lib/db";
import { DATA_EXPORT_SCHEMA_VERSION } from "@/lib/settings/constants";

export interface ExportApplication {
  id: string;
  status: string;
  submissionStatus: string;
  externalApplicationId: string | null;
  userNotes: string | null;
  appliedAt: string;
  updatedAt: string;
  job: {
    title: string;
    location: string | null;
    department: string | null;
    employmentType: string | null;
    remote: boolean;
    company: { name: string };
  };
}

export interface ExportEmail {
  id: string;
  applicationId: string;
  from: string;
  to: string;
  subject: string;
  body: string;
  direction: string;
  receivedAt: string;
  createdAt: string;
}

export interface ExportNotification {
  id: string;
  type: string;
  priority: string;
  title: string;
  body: string | null;
  isRead: boolean;
  readAt: string | null;
  createdAt: string;
}

export interface ExportNotificationPreference {
  emailFrequency: string;
  emailOnOffer: boolean;
  emailOnInterview: boolean;
  emailOnStatusChange: boolean;
  emailOnEmailReceived: boolean;
  emailOnListingRemoved: boolean;
  emailOnTeamMessage: boolean;
  emailOnSystem: boolean;
  emailOnApplyFailed: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ExportSubscription {
  status: string;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
}

export interface ExportLoginEvent {
  createdAt: string;
  ipAddress: string | null;
  userAgent: string | null;
  provider: string | null;
}

export interface ExportProfile {
  firstName: string;
  lastName: string;
  preferredFirstName: string | null;
  email: string;
  phone: string | null;
  location: string | null;
  linkedinUrl: string | null;
  githubUrl: string | null;
  portfolioUrl: string | null;
  headline: string | null;
  summary: string | null;
  currentTitle: string | null;
  currentCompany: string | null;
  yearsExperience: number | null;
  desiredSalaryMin: number | null;
  desiredSalaryMax: number | null;
  openToRemote: boolean;
  openToHybrid: boolean;
  openToOnsite: boolean;
  highestDegree: string | null;
  fieldOfStudy: string | null;
  university: string | null;
  graduationYear: number | null;
  workAuthorization: string | null;
  requiresSponsorship: boolean;
  resumeFileName: string | null;
  resumeMimeType: string | null;
  resumeUrl: string | null;
  // base64 of the original Bytes column, OR a sentinel object if omitted.
  resumeData: string | null;
  resumeData_omitted_due_to_size?: true;
  customAnswers: unknown;
  isComplete: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ExportPayload {
  exportedAt: string;
  schemaVersion: typeof DATA_EXPORT_SCHEMA_VERSION;
  user: {
    id: string;
    email: string | null;
    name: string | null;
    createdAt: string;
    role: string;
  };
  profile: ExportProfile | null;
  applications: ExportApplication[];
  emails: ExportEmail[];
  notifications: ExportNotification[];
  notificationPreferences: ExportNotificationPreference | null;
  subscription: ExportSubscription | null;
  referrals: {
    code: string | null;
    referredUsers: { joinedAt: string; converted: boolean }[];
  };
  loginEvents: ExportLoginEvent[];
}

function iso(d: Date | null | undefined): string | null {
  if (!d) return null;
  return d.toISOString();
}

function isoStrict(d: Date): string {
  return d.toISOString();
}

/**
 * Build the full JSON export for a user. Reads ~7 tables; intended for
 * synchronous response. The 50 MB cap is enforced by the route handler
 * after serialization — see stripResumeBinary for the size-driven fallback.
 */
export async function buildExportPayload(userId: string): Promise<ExportPayload> {
  const [
    user,
    profile,
    applications,
    notifications,
    preferences,
    subscription,
    referralsSent,
    loginEvents,
  ] = await Promise.all([
    db.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        createdAt: true,
        role: true,
        referralCode: true,
        subscriptionStatus: true,
      },
    }),
    db.userProfile.findUnique({ where: { userId } }),
    db.application.findMany({
      where: { userId },
      orderBy: { appliedAt: "asc" },
      include: {
        job: {
          select: {
            title: true,
            location: true,
            department: true,
            employmentType: true,
            remote: true,
            company: { select: { name: true } },
          },
        },
      },
    }),
    db.notification.findMany({
      where: { userId },
      orderBy: { createdAt: "asc" },
    }),
    db.notificationPreference.findUnique({ where: { userId } }),
    db.subscription.findUnique({ where: { userId } }),
    db.referral.findMany({
      where: { referrerId: userId },
      orderBy: { createdAt: "asc" },
      select: { createdAt: true, status: true },
    }),
    db.loginEvent.findMany({
      where: { userId },
      orderBy: { createdAt: "asc" },
      select: {
        createdAt: true,
        ipAddress: true,
        userAgent: true,
        provider: true,
      },
    }),
  ]);

  if (!user) {
    throw new Error(`User not found: ${userId}`);
  }

  // Application IDs power the email lookup. We pull emails in a separate
  // query (rather than as a nested include) to keep the application payload
  // narrow and avoid duplicating bodies inside the application list.
  const applicationIds = applications.map((a) => a.id);
  const emails = applicationIds.length
    ? await db.applicationEmail.findMany({
        where: { applicationId: { in: applicationIds } },
        orderBy: { createdAt: "asc" },
      })
    : [];

  const exportApplications: ExportApplication[] = applications.map((a) => ({
    id: a.id,
    status: a.status,
    submissionStatus: a.submissionStatus,
    externalApplicationId: a.externalApplicationId,
    userNotes: a.userNotes,
    appliedAt: isoStrict(a.appliedAt),
    updatedAt: isoStrict(a.updatedAt),
    job: {
      title: a.job.title,
      location: a.job.location,
      department: a.job.department,
      employmentType: a.job.employmentType,
      remote: a.job.remote,
      company: { name: a.job.company.name },
    },
  }));

  const exportEmails: ExportEmail[] = emails.map((e) => ({
    id: e.id,
    applicationId: e.applicationId,
    from: e.from,
    to: e.to,
    subject: e.subject,
    // htmlBody is intentionally omitted (redundant with body for export).
    body: e.body,
    direction: e.direction,
    receivedAt: isoStrict(e.receivedAt),
    createdAt: isoStrict(e.createdAt),
  }));

  const exportNotifications: ExportNotification[] = notifications.map((n) => ({
    id: n.id,
    type: n.type,
    priority: n.priority,
    title: n.title,
    body: n.body,
    isRead: n.isRead,
    readAt: iso(n.readAt),
    createdAt: isoStrict(n.createdAt),
  }));

  const exportPreferences: ExportNotificationPreference | null = preferences
    ? {
        emailFrequency: preferences.emailFrequency,
        emailOnOffer: preferences.emailOnOffer,
        emailOnInterview: preferences.emailOnInterview,
        emailOnStatusChange: preferences.emailOnStatusChange,
        emailOnEmailReceived: preferences.emailOnEmailReceived,
        emailOnListingRemoved: preferences.emailOnListingRemoved,
        emailOnTeamMessage: preferences.emailOnTeamMessage,
        emailOnSystem: preferences.emailOnSystem,
        emailOnApplyFailed: preferences.emailOnApplyFailed,
        createdAt: isoStrict(preferences.createdAt),
        updatedAt: isoStrict(preferences.updatedAt),
      }
    : null;

  // Surface only the user-facing subscription state. Stripe IDs
  // (stripeCustomerId, stripeSubscriptionId, stripePriceId) are intentionally
  // dropped — they're internal billing plumbing, not user data.
  const exportSubscription: ExportSubscription | null = subscription
    ? {
        status: user.subscriptionStatus,
        currentPeriodEnd: iso(subscription.stripeCurrentPeriodEnd),
        cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
      }
    : { status: user.subscriptionStatus, currentPeriodEnd: null, cancelAtPeriodEnd: false };

  const exportProfile: ExportProfile | null = profile
    ? {
        firstName: profile.firstName,
        lastName: profile.lastName,
        preferredFirstName: profile.preferredFirstName,
        email: profile.email,
        phone: profile.phone,
        location: profile.location,
        linkedinUrl: profile.linkedinUrl,
        githubUrl: profile.githubUrl,
        portfolioUrl: profile.portfolioUrl,
        headline: profile.headline,
        summary: profile.summary,
        currentTitle: profile.currentTitle,
        currentCompany: profile.currentCompany,
        yearsExperience: profile.yearsExperience,
        desiredSalaryMin: profile.desiredSalaryMin,
        desiredSalaryMax: profile.desiredSalaryMax,
        openToRemote: profile.openToRemote,
        openToHybrid: profile.openToHybrid,
        openToOnsite: profile.openToOnsite,
        highestDegree: profile.highestDegree,
        fieldOfStudy: profile.fieldOfStudy,
        university: profile.university,
        graduationYear: profile.graduationYear,
        workAuthorization: profile.workAuthorization,
        requiresSponsorship: profile.requiresSponsorship,
        resumeFileName: profile.resumeFileName,
        resumeMimeType: profile.resumeMimeType,
        resumeUrl: profile.resumeUrl,
        // Bytes → base64 string. Buffer.from(bytes).toString("base64") is
        // the canonical encoding. Null when no resume on file.
        resumeData: profile.resumeData
          ? Buffer.from(profile.resumeData).toString("base64")
          : null,
        customAnswers: profile.customAnswers ?? null,
        isComplete: profile.isComplete,
        createdAt: isoStrict(profile.createdAt),
        updatedAt: isoStrict(profile.updatedAt),
      }
    : null;

  return {
    exportedAt: new Date().toISOString(),
    schemaVersion: DATA_EXPORT_SCHEMA_VERSION,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      createdAt: isoStrict(user.createdAt),
      role: user.role,
    },
    profile: exportProfile,
    applications: exportApplications,
    emails: exportEmails,
    notifications: exportNotifications,
    notificationPreferences: exportPreferences,
    subscription: exportSubscription,
    referrals: {
      code: user.referralCode ?? null,
      // PII scrubbing: the referral history exposes ONLY joinedAt + converted
      // — never the referee's email or userId. The "joined" timestamp is the
      // referral row's createdAt (when the pending link was minted), which
      // doesn't leak referee identity.
      referredUsers: referralsSent.map((r) => ({
        joinedAt: isoStrict(r.createdAt),
        converted: r.status === "CONVERTED",
      })),
    },
    loginEvents: loginEvents.map((e) => ({
      createdAt: isoStrict(e.createdAt),
      ipAddress: e.ipAddress,
      userAgent: e.userAgent,
      provider: e.provider,
    })),
  };
}

/**
 * Drop the resume binary and replace with a sentinel flag, preserving the
 * URL/metadata so the user can retrieve it from Spaces. Returns a NEW
 * payload — never mutates the input.
 */
export function stripResumeBinary(payload: ExportPayload): ExportPayload {
  if (!payload.profile) return payload;
  return {
    ...payload,
    profile: {
      ...payload.profile,
      resumeData: null,
      resumeData_omitted_due_to_size: true,
    },
  };
}

/**
 * Serialize and measure. Returns the JSON string and its byte length so the
 * route can compare against DATA_EXPORT_MAX_BYTES without re-encoding.
 */
export function serializeExport(payload: ExportPayload): {
  json: string;
  bytes: number;
} {
  const json = JSON.stringify(payload);
  // Buffer.byteLength is exact for utf8 — JSON is utf8-encoded over the wire.
  const bytes = Buffer.byteLength(json, "utf8");
  return { json, bytes };
}
