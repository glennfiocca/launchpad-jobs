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
