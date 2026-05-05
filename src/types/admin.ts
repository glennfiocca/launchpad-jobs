import type { ApplicationStatus, AtsProvider, SubscriptionStatus, Role, ReportCategory, ReportStatus } from "@prisma/client"

export type { ReportCategory, ReportStatus }

export type DispatchStatus = "DISPATCHED" | "FAILED" | "PENDING" | "AWAITING_OPERATOR"

export interface AdminApplication {
  id: string
  status: ApplicationStatus
  externalApplicationId: string | null
  trackingEmail: string | null
  submissionError: string | null
  submissionStatus: string
  appliedAt: Date
  updatedAt: Date
  dispatchStatus: DispatchStatus
  user: { id: string; email: string | null; name: string | null }
  job: {
    id: string
    title: string
    publicJobId: string
    boardToken: string
    externalId: string
    provider: AtsProvider
    company: { id: string; name: string; logoUrl: string | null }
  }
  _count: { emails: number; statusHistory: number }
}

export interface ApplicationAuditLogEntry {
  id: string
  actorUserId: string | null
  actor: { id: string; email: string | null; name: string | null } | null
  action: string
  metadata: Record<string, unknown> | null
  createdAt: Date
}

export interface ApplicationDocumentSummary {
  id: string
  kind: string
  fileName: string
  mimeType: string
  sizeBytes: number
  title: string | null
  createdAt: Date
  updatedAt: Date
}

export interface OperatorQueueApplication extends AdminApplication {
  claimedByUserId: string | null
  claimedAt: Date | null
  claimedBy: { id: string; email: string | null; name: string | null } | null
  job: AdminApplication["job"] & { absoluteUrl: string | null }
  hasSummaryPdf: boolean
}

export interface AdminApplicationDetail extends AdminApplication {
  userNotes: string | null
  claimedByUserId: string | null
  claimedAt: Date | null
  claimedBy: { id: string; email: string | null; name: string | null } | null
  dispatchMode: string | null
  applicationSnapshot: Record<string, unknown> | null
  emails: Array<{
    id: string
    fromEmail: string
    toEmail: string
    subject: string
    body: string
    direction: string
    aiClassification: string | null
    aiConfidence: number | null
    aiReasoning: string | null
    sentAt: Date
  }>
  statusHistory: Array<{
    id: string
    fromStatus: ApplicationStatus | null
    toStatus: ApplicationStatus
    reason: string | null
    triggeredBy: string
    createdAt: Date
  }>
  auditLogs: Array<{
    id: string
    actorUserId: string | null
    actor: { id: string; email: string | null; name: string | null } | null
    action: string
    metadata: Record<string, unknown> | null
    createdAt: Date
  }>
  documents: ApplicationDocumentSummary[]
}

export interface AdminApplicationStats {
  total: number
  dispatched: number
  failedDispatch: number
  dispatchRate: number
  last7d: number
  last30d: number
  byStatus: Array<{ status: ApplicationStatus; count: number }>
  failedDispatchLast24h: number
  topFailureReasons?: Array<{ reason: string; count: number }>
}

export interface AdminStats {
  totalUsers: number
  totalApplications: number
  activeJobs: number
  activeBoards: number
  newSignups30d: number
  applications30d: number
  applicationsByStatus: Array<{ status: ApplicationStatus; count: number }>
  subscriptionsByStatus: Array<{ status: SubscriptionStatus; count: number }>
}

export interface AdminUser {
  id: string
  email: string | null
  name: string | null
  role: Role
  subscriptionStatus: SubscriptionStatus
  creditsUsed: number
  creditWindowStart: Date
  createdAt: Date
  _count: { applications: number }
}

export interface AdminJob {
  id: string
  publicJobId: string
  title: string
  location: string | null
  department: string | null
  remote: boolean
  isActive: boolean
  isUSEligible: boolean
  locationCategory: string | null
  countryCode: string | null
  postedAt: Date | null
  company: { id: string; name: string }
  _count: { applications: number }
}

export interface AdminCompanyBoard {
  id: string
  name: string
  boardToken: string
  logoUrl: string | null
  website: string | null
  isActive: boolean
  createdAt: Date
  jobCount: number
}

export interface AdminSyncBoardResult {
  id: string
  boardToken: string
  boardName: string
  status: "SUCCESS" | "FAILURE" | "SKIPPED"
  added: number
  updated: number
  deactivated: number
  applicationsUpdated: number
  errors: string[]
  startedAt: string
  completedAt: string | null
  durationMs: number | null
}

export interface AdminSyncLog {
  id: string
  triggeredBy: string
  startedAt: string
  completedAt: string | null
  status: "RUNNING" | "SUCCESS" | "PARTIAL_FAILURE" | "FAILURE"
  totalBoards: number
  boardsSynced: number
  boardsFailed: number
  totalAdded: number
  totalUpdated: number
  totalDeactivated: number
  totalApplicationsUpdated: number
  durationMs: number | null
  errorSummary: string | null
  boardResults?: AdminSyncBoardResult[]
}

export interface AdminJobReport {
  id: string
  category: ReportCategory
  status: ReportStatus
  message: string | null
  resolvedAt: Date | null
  resolvedBy: string | null
  adminNote: string | null
  createdAt: Date
  updatedAt: Date
  user: { id: string; email: string | null; name: string | null }
  job: {
    id: string
    title: string
    publicJobId: string
    company: { id: string; name: string }
  } | null
}

export interface SavedJobWithDetails {
  savedAt: Date
  job: import("@/types").JobWithCompany
}
