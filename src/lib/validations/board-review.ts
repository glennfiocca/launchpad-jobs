import { z } from "zod"

// `PENDING` is excluded from the action targets — admins can only push
// rows TO a terminal state via these endpoints. Reverting to PENDING is
// handled by a dedicated `/revert` route.
export const actionStatusSchema = z.enum(["APPROVED", "NEEDS_REVIEW", "REJECTED"])

export const atsProviderSchema = z.enum(["GREENHOUSE", "ASHBY"])

export const boardActionSchema = z.object({
  status: actionStatusSchema,
  notes: z.string().max(2000).optional(),
})

export const missActionSchema = z.object({
  status: actionStatusSchema,
  notes: z.string().max(2000).optional(),
})

// Slug rules mirror what the upstream APIs accept: lowercase alnum + hyphen/
// underscore, no spaces. Bound length defensively.
const slugSchema = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[a-z0-9][a-z0-9_-]*$/i, "Slug must be alphanumeric (hyphen/underscore allowed)")
  .transform((s) => s.toLowerCase().trim())

export const missValidateSchema = z.object({
  slug: slugSchema,
  ats: atsProviderSchema,
})

export const missResolveSchema = z.object({
  slug: slugSchema,
  ats: atsProviderSchema,
  notes: z.string().max(2000).optional(),
})

export const revertSchema = z.object({
  kind: z.enum(["board", "miss"]),
  id: z.string().min(1).max(100),
})

export const nextQuerySchema = z.object({
  kind: z.enum(["queue", "misses"]),
})

export const historyQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
})
