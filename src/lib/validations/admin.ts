import { z } from "zod"

export const updateUserSchema = z.object({
  role: z.enum(["USER", "ADMIN"]).optional(),
  resetCredits: z.boolean().optional(),
})

export const updateJobSchema = z.object({
  isActive: z.boolean(),
})

export const createCompanyBoardSchema = z.object({
  name: z.string().min(1).max(200),
  boardToken: z.string().min(1).max(100),
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
  dispatchStatus: z.enum(["DISPATCHED", "FAILED", "PENDING"]).optional(),
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
