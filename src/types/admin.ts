import type { ApplicationStatus, SubscriptionStatus, Role } from "@prisma/client"

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
