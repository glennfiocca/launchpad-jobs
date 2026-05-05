import { z } from "zod"

export const updateUserSchema = z.object({
  role: z.enum(["USER", "ADMIN"]).optional(),
  resetCredits: z.boolean().optional(),
})

export const updateJobSchema = z.object({
  isActive: z.boolean().optional(),
  isUSEligible: z.boolean().optional(),
}).refine((data) => data.isActive !== undefined || data.isUSEligible !== undefined, {
  message: "At least one of isActive or isUSEligible must be provided",
})

export const createCompanyBoardSchema = z.object({
  name: z.string().min(1).max(200),
  boardToken: z.string().min(1).max(100),
  provider: z.enum(["GREENHOUSE", "ASHBY"]).default("GREENHOUSE"),
  logoUrl: z.string().url().optional().or(z.literal("")),
  website: z.string().url().optional().or(z.literal("")),
})

export const updateCompanyBoardSchema = createCompanyBoardSchema.partial().extend({
  isActive: z.boolean().optional(),
})

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
})

export const ALL_APPLICATION_STATUSES = [
  "APPLIED",
  "REVIEWING",
  "PHONE_SCREEN",
  "INTERVIEWING",
  "OFFER",
  "REJECTED",
  "WITHDRAWN",
  "LISTING_REMOVED",
] as const

export const applicationsQuerySchema = paginationSchema.extend({
  status: z.enum(ALL_APPLICATION_STATUSES).optional(),
  dispatchStatus: z.enum(["DISPATCHED", "FAILED", "PENDING", "AWAITING_OPERATOR"]).optional(),
  companyId: z.string().optional(),
  userId: z.string().optional(),
  search: z.string().optional(),
  sortBy: z.enum(["appliedAt", "updatedAt", "status"]).default("appliedAt"),
  sortDir: z.enum(["asc", "desc"]).default("desc"),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
})

export const adminUpdateApplicationSchema = z.object({
  status: z.enum(ALL_APPLICATION_STATUSES).optional(),
  userNotes: z.string().max(10000).optional().nullable(),
  reason: z.string().max(500).optional(),
})

export const bulkApplicationActionSchema = z.object({
  action: z.enum(["retry-dispatch", "export-csv"]),
  ids: z.array(z.string()).min(1).max(500),
})

// ─── Job Reports ──────────────────────────────────────────────────────────────

export const ALL_REPORT_CATEGORIES = [
  "SPAM",
  "INACCURATE",
  "OFFENSIVE",
  "BROKEN_LINK",
  "OTHER",
] as const

export const ALL_REPORT_STATUSES = ["OPEN", "TRIAGED", "RESOLVED", "DISMISSED"] as const

export const createReportSchema = z.object({
  category: z.enum(ALL_REPORT_CATEGORIES),
  message: z.string().max(1000).optional(),
})

export const adminUpdateReportSchema = z.object({
  status: z.enum(ALL_REPORT_STATUSES),
  adminNote: z.string().max(5000).optional(),
})

export const reportsQuerySchema = paginationSchema.extend({
  status: z.enum(ALL_REPORT_STATUSES).optional(),
  category: z.enum(ALL_REPORT_CATEGORIES).optional(),
  search: z.string().optional(),
})
