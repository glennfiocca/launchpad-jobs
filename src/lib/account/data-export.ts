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

export interface ExportSkill {
  id: string;
  name: string;
  category: string;
  proficiency: number;
  yearsUsed: number | null;
  order: number;
}

export interface ExportWorkExperience {
  id: string;
  title: string;
  company: string;
  companyUrl: string | null;
  startDate: string;
  endDate: string | null;
  isCurrent: boolean;
  location: string | null;
  employmentType: string;
  description: string | null;
  order: number;
}

export interface ExportEducationEntry {
  id: string;
  universityId: string | null;
  schoolName: string | null;
  degree: string;
  fieldOfStudy: string;
  startYear: number | null;
  endYear: number | null;
  gpa: number | null;
  honors: string | null;
  activities: string | null;
  order: number;
}

export interface ExportProject {
  id: string;
  name: string;
  url: string | null;
  repoUrl: string | null;
  description: string | null;
  technologies: string[];
  role: string | null;
  startDate: string | null;
  endDate: string | null;
  isOngoing: boolean;
  order: number;
}

export interface ExportCertification {
  id: string;
  name: string;
  issuer: string;
  issueDate: string | null;
  expiryDate: string | null;
  credentialUrl: string | null;
  credentialId: string | null;
  order: number;
}

export interface ExportSpokenLanguage {
  id: string;
  name: string;
  proficiency: string;
  order: number;
}

export interface ExportProfileChildren {
  skills: ExportSkill[];
  workExperiences: ExportWorkExperience[];
  educationEntries: ExportEducationEntry[];
  projects: ExportProject[];
  certifications: ExportCertification[];
  spokenLanguages: ExportSpokenLanguage[];
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
  // Phase 5 — extended professional / social links
  twitterUrl: string | null;
  stackOverflowUrl: string | null;
  dribbbleUrl: string | null;
  behanceUrl: string | null;
  mediumUrl: string | null;
  devToUrl: string | null;
  googleScholarUrl: string | null;
  huggingFaceUrl: string | null;
  kaggleUrl: string | null;
  youtubeUrl: string | null;
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
  // Phase 5 — job-search preferences
  noticePeriodWeeks: number | null;
  earliestStartDate: string | null;
  targetRoles: string[];
  targetIndustries: string[];
  companySizePreferences: string[];
  relocationOpen: boolean;
  relocationCities: string[];
  currencyPreference: string;
  equityImportance: string | null;
  desiredEmploymentTypes: string[];
  searchStatus: string;
  // Phase 5 — compliance
  hasDriversLicense: boolean | null;
  willingBackgroundCheck: boolean | null;
  willingDrugTest: boolean | null;
  securityClearance: string;
  eligibleCountries: string[];
  // Phase 5 — application templates
  coverLetterIntro: string | null;
  whyImLookingTemplate: string | null;
  isComplete: boolean;
  createdAt: string;
  updatedAt: string;
  // Phase 5 — child entities owned by this profile.
  children: ExportProfileChildren;
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
  // Child resources are scoped via `profile: { userId }` to avoid a separate
  // profileId lookup round-trip. Stable ordering: order ASC, then createdAt
  // ASC (matches the editor's display order).
  const childWhere = { profile: { userId } } as const;
  const childOrderBy = [{ order: "asc" as const }, { createdAt: "asc" as const }];

  const [
    user,
    profile,
    applications,
    notifications,
    preferences,
    subscription,
    referralsSent,
    loginEvents,
    skills,
    workExperiences,
    educationEntries,
    projects,
    certifications,
    spokenLanguages,
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
    db.skill.findMany({ where: childWhere, orderBy: childOrderBy }),
    db.workExperience.findMany({ where: childWhere, orderBy: childOrderBy }),
    db.educationEntry.findMany({ where: childWhere, orderBy: childOrderBy }),
    db.project.findMany({ where: childWhere, orderBy: childOrderBy }),
    db.certification.findMany({ where: childWhere, orderBy: childOrderBy }),
    db.spokenLanguage.findMany({ where: childWhere, orderBy: childOrderBy }),
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

  // Child-entity serializers strip plumbing fields (profileId, createdAt,
  // updatedAt) — those are internal book-keeping, not user-facing data.
  const exportSkills: ExportSkill[] = skills.map((s) => ({
    id: s.id,
    name: s.name,
    category: s.category,
    proficiency: s.proficiency,
    yearsUsed: s.yearsUsed,
    order: s.order,
  }));

  const exportWorkExperiences: ExportWorkExperience[] = workExperiences.map((w) => ({
    id: w.id,
    title: w.title,
    company: w.company,
    companyUrl: w.companyUrl,
    startDate: isoStrict(w.startDate),
    endDate: iso(w.endDate),
    isCurrent: w.isCurrent,
    location: w.location,
    employmentType: w.employmentType,
    description: w.description,
    order: w.order,
  }));

  const exportEducationEntries: ExportEducationEntry[] = educationEntries.map((e) => ({
    id: e.id,
    universityId: e.universityId,
    schoolName: e.schoolName,
    degree: e.degree,
    fieldOfStudy: e.fieldOfStudy,
    startYear: e.startYear,
    endYear: e.endYear,
    gpa: e.gpa,
    honors: e.honors,
    activities: e.activities,
    order: e.order,
  }));

  const exportProjects: ExportProject[] = projects.map((p) => ({
    id: p.id,
    name: p.name,
    url: p.url,
    repoUrl: p.repoUrl,
    description: p.description,
    technologies: p.technologies,
    role: p.role,
    startDate: iso(p.startDate),
    endDate: iso(p.endDate),
    isOngoing: p.isOngoing,
    order: p.order,
  }));

  const exportCertifications: ExportCertification[] = certifications.map((c) => ({
    id: c.id,
    name: c.name,
    issuer: c.issuer,
    issueDate: iso(c.issueDate),
    expiryDate: iso(c.expiryDate),
    credentialUrl: c.credentialUrl,
    credentialId: c.credentialId,
    order: c.order,
  }));

  const exportSpokenLanguages: ExportSpokenLanguage[] = spokenLanguages.map((l) => ({
    id: l.id,
    name: l.name,
    proficiency: l.proficiency,
    order: l.order,
  }));

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
        twitterUrl: profile.twitterUrl,
        stackOverflowUrl: profile.stackOverflowUrl,
        dribbbleUrl: profile.dribbbleUrl,
        behanceUrl: profile.behanceUrl,
        mediumUrl: profile.mediumUrl,
        devToUrl: profile.devToUrl,
        googleScholarUrl: profile.googleScholarUrl,
        huggingFaceUrl: profile.huggingFaceUrl,
        kaggleUrl: profile.kaggleUrl,
        youtubeUrl: profile.youtubeUrl,
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
        noticePeriodWeeks: profile.noticePeriodWeeks,
        earliestStartDate: iso(profile.earliestStartDate),
        targetRoles: profile.targetRoles,
        targetIndustries: profile.targetIndustries,
        companySizePreferences: profile.companySizePreferences,
        relocationOpen: profile.relocationOpen,
        relocationCities: profile.relocationCities,
        currencyPreference: profile.currencyPreference,
        equityImportance: profile.equityImportance,
        desiredEmploymentTypes: profile.desiredEmploymentTypes,
        searchStatus: profile.searchStatus,
        hasDriversLicense: profile.hasDriversLicense,
        willingBackgroundCheck: profile.willingBackgroundCheck,
        willingDrugTest: profile.willingDrugTest,
        securityClearance: profile.securityClearance,
        eligibleCountries: profile.eligibleCountries,
        coverLetterIntro: profile.coverLetterIntro,
        whyImLookingTemplate: profile.whyImLookingTemplate,
        isComplete: profile.isComplete,
        createdAt: isoStrict(profile.createdAt),
        updatedAt: isoStrict(profile.updatedAt),
        children: {
          skills: exportSkills,
          workExperiences: exportWorkExperiences,
          educationEntries: exportEducationEntries,
          projects: exportProjects,
          certifications: exportCertifications,
          spokenLanguages: exportSpokenLanguages,
        },
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
